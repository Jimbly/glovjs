// Post-processes a @yao-pkg/pkg Windows exe to use the GUI subsystem
//   (no console window) and our own icon and version info.
// pkg appends its payload after the Node binary and records absolute file offsets
//   (as space-padded text) inside it, so after resizing the PE image we shift them.
const assert = require('assert');

const PRELUDE_START = '(function(process, require, console, EXECPATH_FD, PAYLOAD_POSITION, PAYLOAD_SIZE)';
const POSITION_FIELD_WIDTH = '// PAYLOAD_POSITION //'.length;
const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

function peHeaders(buf) {
  let pe = buf.readUInt32LE(0x3C);
  assert.equal(buf.readUInt32LE(pe), 0x00004550, 'Not a PE file');
  let opt = pe + 24;
  return { pe, opt };
}

// End of the PE image's raw section data, i.e. where pkg's payload begins
function peEnd(buf) {
  let { pe, opt } = peHeaders(buf);
  let num_sections = buf.readUInt16LE(pe + 6);
  let sections = opt + buf.readUInt16LE(pe + 20);
  let end = 0;
  for (let ii = 0; ii < num_sections; ++ii) {
    let sec = sections + 40 * ii;
    end = Math.max(end, buf.readUInt32LE(sec + 20) + buf.readUInt32LE(sec + 16));
  }
  return end;
}

function shiftField(buf, value, delta) {
  let needle = Buffer.from(String(value).padEnd(POSITION_FIELD_WIDTH, ' '));
  let idx = buf.indexOf(needle);
  assert(idx > 0 && !(buf[idx - 1] >= 0x30 && buf[idx - 1] <= 0x39), `Offset field for ${value} not found`);
  assert.equal(buf.indexOf(needle, idx + 1), -1, `Offset field for ${value} is ambiguous`);
  Buffer.from(String(value + delta).padEnd(POSITION_FIELD_WIDTH, ' ')).copy(buf, idx);
}

function patchExeSync(ResEdit, { src: input, original_filename, name, company, ico }) {
  let { opt } = peHeaders(input);
  assert.equal(input.readUInt32LE(opt + 112 + 4 * 8 + 4), 0, 'Signed exe not supported (sign after patching)');
  let payload_pos = peEnd(input);
  let prelude_pos = input.lastIndexOf(PRELUDE_START);
  assert(prelude_pos > payload_pos, 'pkg prelude not found');

  let exe = ResEdit.NtExecutable.from(input.subarray(0, payload_pos));
  let res = ResEdit.NtExecutableResource.from(exe);

  let icon_file = ResEdit.Data.IconFile.from(ico);
  for (let group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries, group.id, group.lang, icon_file.icons.map((icon) => icon.data));
  }

  for (let vi of ResEdit.Resource.VersionInfo.fromEntries(res.entries)) {
    for (let lang of vi.getAllLanguagesForStringValues()) {
      vi.setStringValues(lang, {
        CompanyName: company,
        ProductName: name,
        FileDescription: name,
        OriginalFilename: original_filename,
        InternalName: name,
        LegalCopyright: '',
      });
    }
    vi.outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  let base = Buffer.from(exe.generate());
  let delta = base.length - payload_pos;
  shiftField(base, payload_pos, delta);
  shiftField(base, prelude_pos, delta);

  ({ opt } = peHeaders(base));
  assert.equal(base.readUInt16LE(opt + 68), IMAGE_SUBSYSTEM_WINDOWS_CUI);
  base.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, opt + 68);

  return Buffer.concat([base, input.subarray(payload_pos)]);
}

let resedit_promise;

// params: { src: Buffer, original_filename, name, company, ico: Buffer }
// cb(err, Buffer)
exports.patchExe = function patchExe(params, cb) {
  resedit_promise = resedit_promise || import('resedit');
  resedit_promise.then(function (ResEdit) {
    let result;
    try {
      result = patchExeSync(ResEdit, params);
    } catch (err) {
      return void cb(err);
    }
    cb(null, result);
  }, cb);
};
