import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { makeLaunchMetadataHandler } from '../../shared/launchMetadata.js';

export default makeLaunchMetadataHandler({
  authenticate: req => createClientFromRequest(req).auth.me(),
  getSecret: name => secrets.get(name),
});
