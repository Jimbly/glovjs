const assert = require('assert');
const fs = require('fs');
const NEW_SET = 'mynewset';
['walls', 'cells', 'vstyles'].forEach(function (dir) {
  let files = fs.readdirSync(dir);
  files = files.filter((a) => a.startsWith('demo'));
  assert(files.length);
  files.forEach(function (filename) {
    let data = fs.readFileSync(`${dir}/${filename}`, 'utf8');
    let data2 = data.replace(/demo/g, NEW_SET);
    assert(data !== data2);
    let outfile = `${dir}/${filename.replace('demo', NEW_SET)}`;
    console.log(outfile);
    fs.writeFileSync(outfile, data2);
  });
});
