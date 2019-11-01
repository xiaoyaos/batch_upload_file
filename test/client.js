const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const DirArray = require('dir-array');
const Upload = require('../index');

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
  Upload.process();

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
})();


