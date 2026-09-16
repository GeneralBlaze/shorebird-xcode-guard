import { glob } from 'glob';
import Mocha from 'mocha';
import * as path from 'node:path';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });
  const suite = process.env['SXG_SUITE'] ?? 'shorebird';
  const files = await glob(
    suite === 'shorebird' ? ['shorebird.test.js', 'statusBar.test.js'] : `${suite}.test.js`,
    { cwd: __dirname },
  );
  files.forEach((file) => mocha.addFile(path.resolve(__dirname, file)));
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures > 0 ? reject(new Error(`${failures} integration test(s) failed`)) : resolve(),
    );
  });
}
