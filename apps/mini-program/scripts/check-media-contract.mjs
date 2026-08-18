import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const followSource = fs.readFileSync(path.join(root, 'src', 'api', 'follow.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'src', 'utils', 'api.js'), 'utf8');

const assertions = [
  [followSource.includes("referenceType: 'FOLLOW_UP'"), 'follow upload must use FOLLOW_UP referenceType'],
  [followSource.includes('referenceId: followId'), 'follow upload must bind the media asset to the follow-up id'],
  [followSource.includes('if (!assetId) throw'), 'follow upload must reject responses without a persistent asset id'],
  [followSource.includes('return { assetId }'), 'follow result must persist the asset id instead of only a signed URL'],
  [apiSource.includes('/media/${encodeURIComponent(assetId)}/url'), 'follow detail must refresh an authorized media URL'],
  [apiSource.includes('imageAssets: images'), 'follow detail must retain the persistent media descriptors'],
];

const uploadIndex = followSource.indexOf('await uploadFollowImage');
const completeIndex = followSource.lastIndexOf('return complete(');
assertions.push([
  uploadIndex >= 0 && completeIndex > uploadIndex,
  'all local images must upload successfully before the follow-up completion request',
]);

const failures = assertions.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error(`Media contract failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Media contract passed (persistent asset ids, follow-up authorization, signed URL refresh).');
