const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

// 初始化上传控件
async function initMulter(){
  var storage = multer.diskStorage({
    destination: async function (req, file, cb) {
      let mup = path.join(__dirname, './uploads/');
      if (!fs.existsSync(mup)) {
        mkdirp.sync(mup);
      }
      cb(null, mup);
    },
    filename: function (req, file, cb) {
      const { originalname } = file;
      const ext = path.extname(originalname);
      cb(null, file.originalname)
    }
  })
  const upload = multer({ storage: storage });
  return upload;
}

router.post('/file', async (req, res) => {
  console.log('=======》接收文件')
  const upload = await initMulter();
  upload.array('file', 100)(req, res, async (err) => {
    if (err instanceof multer.MulterError || err) {
      return res.send('error');
    }
    return res.send('success');
  })
})

router.post('/check_file', async (req, res) => {
  // console.log(req.body.filenames)
  res.send(req.body.filenames)
})

module.exports = router;