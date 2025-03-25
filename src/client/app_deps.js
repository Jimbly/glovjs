/* globals deps */
require('../glov/client/require.js');

// Node built-in replacements
deps.assert = require('assert');
deps.buffer = require('buffer');
deps['glov-async'] = require('glov-async');
deps['gl-mat3/create'] = require('gl-mat3/create');
deps['gl-mat3/fromMat4'] = require('gl-mat3/fromMat4');
deps['gl-mat4/copy'] = require('gl-mat4/copy');
deps['gl-mat4/create'] = require('gl-mat4/create');
deps['gl-mat4/invert'] = require('gl-mat4/invert');
deps['gl-mat4/lookAt'] = require('gl-mat4/lookAt');
deps['gl-mat4/multiply'] = require('gl-mat4/multiply');
deps['gl-mat4/perspective'] = require('gl-mat4/perspective');
deps['gl-mat4/transpose'] = require('gl-mat4/transpose');
deps['@jimbly/howler/src/howler.core.js'] = require('@jimbly/howler/src/howler.core.js');
deps['@jimbly/howler/src/plugins/howler.spatial.js'] = require('@jimbly/howler/src/plugins/howler.spatial.js');
// Spine support:
deps['spine-core/AnimationState'] = require('@jimbly/spine-core/dist/AnimationState');
deps['spine-core/AnimationStateData'] = require('@jimbly/spine-core/dist/AnimationStateData');
deps['spine-core/AtlasAttachmentLoader'] = require('@jimbly/spine-core/dist/AtlasAttachmentLoader');
deps['spine-core/ClippingAttachment'] = require('@jimbly/spine-core/dist/attachments/ClippingAttachment');
deps['spine-core/MeshAttachment'] = require('@jimbly/spine-core/dist/attachments/MeshAttachment');
deps['spine-core/RegionAttachment'] = require('@jimbly/spine-core/dist/attachments/RegionAttachment');
deps['spine-core/SlotData'] = require('@jimbly/spine-core/dist/SlotData');
deps['spine-core/Skeleton'] = require('@jimbly/spine-core/dist/Skeleton');
deps['spine-core/SkeletonBinary'] = require('@jimbly/spine-core/dist/SkeletonBinary');
// deps['spine-core/SkeletonJson'] = require('@jimbly/spine-core/dist/SkeletonJson');
deps['spine-core/TextureAtlas'] = require('@jimbly/spine-core/dist/TextureAtlas');
deps['spine-core/Utils'] = require('@jimbly/spine-core/dist/Utils');
