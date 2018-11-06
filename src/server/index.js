const express = require('express');
const path = require('path');

let app = express();
app.use(express.static(path.join(__dirname, '../client/')));

let port = process.env.port || 3000;

app.listen(port, () => {
  console.log(`Running server at http://localhost:${port}`);
});
