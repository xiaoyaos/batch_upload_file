# batch_upload_pic

## 介绍
脱离redis， 基于内存， 批量上传文件到远程服务器，按照设置大小设置每次请求的包的大小和并发数量限制

## API
初始化任务队列
```js
Upload.init({
  base_url: 'http://127.0.0.1:3008/',   // 远程目标服务器地址
  check_path: 'check_file',             // 文件校验接口
  upload_path: 'file',                  // 上传接口
});
```

添加任务
```js
var file_arr = [ 'D:/files/a.test', 'D:/files/b.test' ];
Upload.createJob(file_arr);
```

执行任务
```js
Upload.process();
```

查询当前任务状态
```js
const status = await Upload.status();
console.log(status);
```



## TIPS
### 支持上传的文件可以在./lib/file_ext.json 中添加或修改
```js
[
  {
    "ext": ".png",
    "contentType": "image/png"
  },
  {
    "ext": ".jpeg",
    "contentType": "image/jpeg"
  },
  {
    "ext": "jpg",
    "contentType": "image/jpeg"
  },
  {
    "ext": ".txt",
    "contentType": "text/plain"
  }
]
```

第三方库：bagpipe  需要修改源码./lib/bagpipe.js 148行为：method.apply(this, args);