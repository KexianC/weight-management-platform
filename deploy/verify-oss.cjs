const OSS = require('ali-oss');
const { randomUUID } = require('node:crypto');

async function main() {
  const key = `deployment-check/${randomUUID()}.txt`;
  const client = new OSS({
    region: process.env.OSS_REGION,
    endpoint: process.env.OSS_ENDPOINT,
    bucket: process.env.OSS_BUCKET,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    secure: true,
  });

  try {
    await client.put(key, Buffer.from('kxjz deployment check', 'utf8'));
    const result = await client.head(key);
    if (result.res?.status !== 200) {
      throw new Error(`Unexpected OSS HEAD status: ${result.res?.status}`);
    }
    console.log(`OSS_CHECK_OK key=${key} status=${result.res.status}`);
  } finally {
    await client.delete(key).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`OSS_CHECK_FAILED ${error.code ?? ''} ${error.message}`.trim());
  process.exitCode = 1;
});
