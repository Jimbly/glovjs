module.exports = {
  server_js_files: ['**/*.[jt]s', '!**/client/**/*'],
  server_static: ['**/glov/common/words/*.gkg'],
  all_js_files: ['**/*.[jt]s', '!client/vendor/**/*'],
  client_js_files: [
    '**/*.[jt]s',
    '!**/server/**/*.[jt]s',
    '!client/vendor/**/*.[jt]s',
  ],
  client_json_files: ['client/**/*.json', 'client/**/*.json5', '!client/vendor/**/*.json'],
  server_json_files: ['server/**/*.json', 'server/**/*.json5'],
  client_html: ['client/**/*.html'],
  client_html_index: ['**/client/index.html'],
  extra_client_html: [],
  client_css: ['client/**/*.css', '!client/sounds/Bfxr/**'],
  client_static: [
    'client/**/*.webm',
    'client/**/*.mp3',
    'client/**/*.wav',
    'client/**/*.ogg',
    'client/**/*.png',
    'client/**/*.jpg',
    'client/**/*.glb',
    'client/**/*.ico',
    '!**/unused/**',
    '!client/sounds/Bfxr/**',
    // 'client/**/vendor/**',
    // 'client/manifest.json',
  ],
  client_vendor: ['client/**/vendor/**'],
  compress_files: [
    'client/**/*.js',
    'client/**/*.html',
    'client/**/*.css',
    'client/**/*.glb',
    'client/**/manifest.json',
  ],
  client_fsdata: [
    'client/shaders/**',
    'glov/client/shaders/**',
    'glov/client/models/box_textured_embed.glb',
    'glov/client/words/*.txt',
    'glov/common/words/*.gkg',
  ],
  default_defines: {
    PLATFORM: 'web',
    ENV: 'default',
  },
  extra_index: [],
  bundles: [{
    entrypoint: 'app',
    deps: 'app_deps',
    is_worker: false,
    do_version: 'client/app.ver.json',
  }],
  extra_client_tasks: [],
  extra_prod_inputs: [], // Will bypass the production zip bundling, but still get in the raw production output
  extra_zip_inputs: [],
  client_intermediate_input: [
    'client_json:**',
    'client_js_uglify:**',
  ],
  client_register_cbs: [],
};
require('./config.project.js')(module.exports);
