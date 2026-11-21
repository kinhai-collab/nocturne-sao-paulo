/**
 * Configure only the beta invitation URL scheme on generated Capacitor iOS.
 * Run after npx cap add ios; no Apple signing credentials are needed.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const plist=resolve(process.env.ENKAI_IOS_INFO_PLIST ||
  join(import.meta.dirname,'..','ios','App','App','Info.plist'));
let content=await readFile(plist,'utf8');
if (content.includes('<string>enkai</string>')) {
  console.log('Enkai invite URL scheme already configured.');
} else {
  if (content.includes('<key>CFBundleURLTypes</key>'))
    throw Error('URL types already set. Review custom scheme configuration manually.');
  const block=[
    '  <key>CFBundleURLTypes</key>',
    '  <array>',
    '    <dict>',
    '      <key>CFBundleURLName</key>',
    '      <string>com.kinhai.enkai.beta</string>',
    '      <key>CFBundleURLSchemes</key>',
    '      <array><string>enkai</string></array>',
    '    </dict>',
    '  </array>',
  ].join('\n');
  const marker='</dict>\n</plist>';
  if (!content.includes(marker)) throw Error('Unexpected iOS Info.plist; no edits made');
  content=content.replace(marker,block+'\n'+marker);
  await writeFile(plist,content);
  console.log('Configured custom invitation scheme; no auth tokens permitted in links.');
}
