import { uploadLaunchMetadata, validateLaunchImage, validateMetadataDetails } from './launchMetadata.js';
import { validateLaunch } from './market.js';

// Public CIDs only, in memory. Each File has independent retry state; stale async
// results cannot overwrite a new file. No keys, transactions, or uploads on edit.
export function createDbcMetadataSession() {
  const uploads = new WeakMap();
  return {
    async resolve({ file, details, manualMetadata, metadataUri, invoke, fetchImpl = fetch,
      ensureCurrent = () => {}, onStage = undefined }) {
      ensureCurrent();
      if (manualMetadata) {
        const uri = metadataUri.trim();
        validateLaunch({ ...details, metadataUri: uri });
        return uri;
      }
      validateMetadataDetails(details); await validateLaunchImage(file); ensureCurrent();
      const key = JSON.stringify([details.name, details.symbol, details.description || '']);
      const cached = uploads.get(file) || {};
      uploads.set(file, cached);
      if (cached.key === key && cached.metadataUri) return cached.metadataUri;
      const result = await uploadLaunchMetadata({ file, details, imageCid: cached.imageCid, fetchImpl,
        invoke: (...args) => { ensureCurrent(); return invoke(...args); },
        onStage: value => { ensureCurrent(); onStage?.(value); },
        onImageUploaded: cid => { cached.imageCid = cid; ensureCurrent(); },
      });
      cached.key = key; cached.metadataUri = result.metadataUri;
      ensureCurrent();
      return result.metadataUri;
    },
  };
}
