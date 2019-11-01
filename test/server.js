const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const router = require('./router');
app.use('/', router);

app.listen(3008, ()=>{
  console.log('listen port 3008···');
})