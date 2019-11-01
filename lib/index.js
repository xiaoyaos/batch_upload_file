/**
 * 批量上传文件任务队列
 * 添加任务到队列：适配数组和单任务数据添加，如果任务没有在工作则重置working、current、retry数据，否则不重置，每次添加任务都会重置任务总数量重置
 * 开始工作：从对头开始取出任务数据，进行上传，如果上传成功，则继续下一个任务，失败且尝试次数达到限制时，停止任务，且清空任务参数，如果全部成功，将工作状态改为false
 * 具体上传控制：读取文件二进制流，发送给远程服务器，成功继续下一个任务，失败->为达到最大重试次数，将任务添加到队列队尾，继续下一个任务，如果达到最大重试限制次数则停止任务
 */
const request = require('request-promise');
const fs = require('fs');
const path = require('path');
const Bagpipe = require('bagpipe');
const file_exts = require('./file_ext.json');

class BatchUploadPicQueue {
  
  constructor(){
    this.queue = [];            // 任务队列
    this.increaseId = 0;        // 任务自增ID， 项目重启才会重置
    this.current = 0;           // 任务进度数量
    this.total = 0;             // 任务总数，上次工作完成且下一次工作重新开始时重置，如果一次任务正在工作中时添加任务会累加任务总数
    this.working = false;       // 当前是否正在工作（上传）
    this.exception = 0;         // 任务是否异常 0 无异常 -1 HTTP请求异常 -2 校验文件异常 -3 上传文件为空异常

    this.bagpipe;
    this.options = {
      base_url: null,
      check_path: null,
      upload_path: null,
      retry: 0,                 // 错误尝试次数技术
      max_retry: 10,            // 最大错误尝试次数
      max_load: 30,             // 图片上传分包大小
      check_max_load: 50,       // 检查已上传的文件分包大小
      parallel_count: 10,       // 上传并发数
      check_file: true,         // 是否检查校验文件  默认true
    }
    this.contentType = '1';
    console.log('upload queue create end->listen queue work');
  }

  /**
   * 初始化参数
   * @param {*} options { base_url<String: 目标服务器地址>, check_path<String: 校验检查任务数据url路径>, upload_path<String: 上传url路径> } 
   */
  init(options = {}) {
    const { base_url, check_path, upload_path } = options;
    if(!base_url){
      throw new Error('param base_url is must');
    }
    if(!check_path){
      throw new Error('param check_path is must');
    }
    if(!upload_path){
      throw new Error('param upload_path is must');
    }
    Object.assign(this.options, options);
  }

  // 与远程服务器进行数据比对过滤
  async fileCheck(){
    let dir = '';
    let filenames = this.queue.map(item=> {
      dir = path.parse(item.data).dir;
      return  path.parse(item.data).base;
    });
    // 待检查的文件名进行去重
    filenames = Array.from(new Set(filenames));
    let exist_filenames = [];
    const length = Math.ceil(filenames.length/this.options.check_max_load);
    for (let i = 0; i < length; i++) {
      let current_filenames = filenames.splice(0, this.options.check_max_load);
      let result;
      try {
        result = await request({
          method: 'POST',
          url: this.options.base_url + this.options.check_path,
          body: {
            filenames: current_filenames,
          },
          json: true,
        });
      } catch (error) {
        console.log('**************************', error);
        return false;
      }
      exist_filenames = exist_filenames.concat(result);
    }
    exist_filenames = Array.from(new Set(exist_filenames));
    const exist_files = exist_filenames.map(item=>{
      return path.join(dir, item);
    })
    
    this.increaseId = 0;
    this.queue = [];
    for (const obj of exist_files) {
      this.queue.push({
        id: this.increaseId++,
        data: obj
      });
    }
  }

  /**
   * 增加队列任务
   * @param {*} jobData json array or json
   */
  createJob(jobData) {    
    this.bagpipe = new Bagpipe(this.options.retry);
    if( jobData instanceof Array){
      for (const obj of jobData) {
        this.queue.push({
          id: this.increaseId++,
          data: obj
        });
      }
    }else{
      this.queue.push({
        id: this.increaseId++,
        data: jobData
      });
    }
    // 添加任务是，如果不在工作状态，则重置任务状态参数
    if(!this.working){
      this.working = true;
      this.exception = 0; 
      this.current = 0;
      this.options.retry = 0;
      this.total = this.queue.length;
    }
    console.log('成功添加任务到队列，目前任务数：', this.queue.length);
  }

  async process(){
    await this.getContentType();
    if(this.options.check_file){
      console.time('file check');
      await this.fileCheck();
      console.timeEnd('file check');
    }

    console.time('upload file');
    // 检测任务队列长度
    // const  length = this.queue.length;
    const length = Math.ceil(this.queue.length/this.options.max_load);
    for (let i = 0; i < length ; i++) {
      const currentJob = this.queue.splice(0, this.options.max_load);
      this.bagpipe.push(this.upload, currentJob, this, (err, that, error)=>{
        if(err && err === -1){
          this.options.retry++;
          console.log('上传请求异常！目前错误重试次数：', this.options.retry);
          // 重试次数需要提前一个轮回，因为bagpipe基本是一轮并发结束后才开始回调，所以正常劫持到最大重试次数时，其实bagpipe同时还会再继续尝试一轮并发数的任务，暂时不考虑
          // bagpipe包需要修改：148行，apply中将this传递到upload中，再传递到回调中
          if(this.options.retry >= this.options.max_retry){
            
            // 请求异常次数过多, 清空任务队列
            console.log('尝试' + this.options.retry +'次，终止任务！');
            // 尝试最大次数，结束此次任务
            that.limit = 0;
            that.queue = [];
            this.exception = -1;
            this.working = false;
            this.queue = [];
            console.timeEnd('upload file');
            console.log('exception quit!!');
            return false;
          }else{
            // 请求异常则将此次job数据加入队列队尾
            const currentJob_Arr = currentJob.map(x=>{return x.data});
            this.createJob(currentJob_Arr);
          }
        }
        this.current += currentJob.length;
        if(this.current >= this.total){
          this.working = false;
          console.timeEnd('upload file');
        }
        return true;
      });
    }
  }
  
  async upload(job, queue, callbalk) {
    if(!job) return;
    // console.log(`Processing job`, job);

    let data = {}
    data['file'] = [];
    for (const obj of job) {
      try{
        let file_buffer = fs.readFileSync(new URL('file://'+obj.data));
        data['file'].push({
          value: file_buffer,
          options: {
            filename: path.parse(obj.data).base,
            contentType: queue.contentType,
          }
        })
      }catch(e){
        console.log(e)
        console.log(`文件${obj.data}读取错误！`);
      }
    }
    
    try {
      await request({
        method: 'POST',
        url: queue.options.base_url + queue.options.upload_path,
        formData: data,
        json: true,
      });
    } catch (error) {
      // 请求出错
      return callbalk(-1, this, error);
    }
    return callbalk(null);
  }

  // 识别文件ContentType
  async getContentType(){
    const fileExt = path.parse(this.queue[0].data).ext;
    for (const item of file_exts) {
      if(item.ext == fileExt){
        this.contentType = item.contentType;
        break;
      }
    }
    if(!this.contentType){
      throw new Error(`Extension (${fileExt}) not supported`);
    }
  }

  /**
   * 设置异常
   * @param {*} code 0 无异常 -1 HTTP请求异常 -2 校验文件异常 -3 上传文件为空异常 -4 上传任务正在工作中
   */
  async setException(code = 0){
    this.exception = code;
  }
  // 停止当前上传任务
  async stop() {
    console.log('====================>停止并清空任务');
    this.reset();
  }

  // 全部任务成功完成
  async finished() {
    console.log('====================>完成并清空任务');
    this.reset();
  }

  // 任务当前状态进度，如果完成了则将工作状态改为false
  async status(){
    console.log('====================>查询任务状态');
    return {
      total: this.total,
      current: this.current,
      working: this.working,
      exception: this.exception 
    }
  }

  async reset(){
    this.queue = [];
    this.total = 0;
    this.current = 0;
    this.working = false;
    this.options.retry = 0;
  }
}

module.exports = new BatchUploadPicQueue();
