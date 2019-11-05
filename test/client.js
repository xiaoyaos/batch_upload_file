const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const DirArray = require('dir-array');
const Upload = require('../index');
const request = require('request-promise');

(async ()=> {
  // create files dir
  const test_file_dir = path.join(__dirname, './files'); 
  if(!fs.existsSync(test_file_dir)){
    mkdirp.sync(test_file_dir);
    // generate wait upload test file
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(path.join(test_file_dir, `test${i}.txt`), `this is file ${i}`);
    }
  }else{
    console.log('test file exist');
  }

  // start test
  // *********************读取文件列表************
  var files = new DirArray(path.join(__dirname, './files'));
  files = Array.from(new Set(files));
  file_arr = files.map(file=>{
    return path.join(__dirname, './files', file);
  })
  
  // 初始化任务参数
  Upload.init({
    base_url: 'http://127.0.0.1:3008/',
    check_path: 'check_file',
    upload_path: 'file',
  });

  // 添加任务
  Upload.createJob(file_arr);
  // 执行任务
  console.time('upload file');
  Upload.process(upload, upload_callback);
  console.timeEnd('upload file');

  // 查询任务当前状态
  for (let i = 0; i < 10; i++) {
    const status = await Upload.status();
    console.log(status);
    if(!status.working) break;
    await new Promise((res)=>{
      setTimeout(()=>{
       res(); 
      }, 1000);
    });
  }


  /**
   * 具体上传逻辑
   * @param {*} job       任务数据
   * @param {*} queue     当前任务队列实例对象
   * @param {*} callbalk  上传回调
   */
  async function upload(job, queue, callbalk) {
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

  /**
   * 
   * @param {*} err 
   * @param {*} error 
   */
  async function upload_callback(err, error) {
    console.log('constom callback:', error);
  }

})();


