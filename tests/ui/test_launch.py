"""Real Chromium UI, actual client/review code, fixture wallet and RPC only.
Every non-loopback request is aborted except an explicitly mocked image upload.
No deployment, external RPC or public-chain transaction is reachable here.
"""
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from urllib.parse import urlparse
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = 'http://127.0.0.1:4177'
ARTIFACTS = Path(os.environ.get('DBC_UI_ARTIFACTS', tempfile.mkdtemp(prefix='dbc-ui-')))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')

class LaunchUI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.log = open(ARTIFACTS / 'vite.log', 'w')
        cls.server = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', '--config', 'tests/ui/vite.config.mjs'], cwd=ROOT, stdout=cls.log, stderr=subprocess.STDOUT)
        for _ in range(150):
            if cls.server.poll() is not None:
                raise RuntimeError('Fixture server exited. Inspect vite.log.')
            try:
                with urlopen(ORIGIN, timeout=1) as response:
                    if response.status == 200:
                        break
            except Exception:
                time.sleep(0.2)
        else:
            cls.server.terminate()
            raise RuntimeError('Fixture server startup timed out')
        cls.pw = sync_playwright().start()
        options = {'headless': True, 'args': ['--no-sandbox']}
        if os.environ.get('CHROME_BIN'):
            options['executable_path'] = os.environ['CHROME_BIN']
        cls.browser = cls.pw.chromium.launch(**options)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.terminate()
        try:
            cls.server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.server.kill()
        cls.log.close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1200, 'height': 1000}, permissions=['clipboard-read', 'clipboard-write'])
        self.page = self.context.new_page()
        self.page.set_default_timeout(8000)
        self.errors = []
        self.image_posts = 0
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        def route(request):
            url = urlparse(request.request.url)
            if url.hostname == '127.0.0.1':
                request.continue_()
            elif url.hostname == 'uploads.pinata.cloud' and url.path == '/v3/files/test':
                self.image_posts += 1
                request.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'data': {'cid': 'bafybeig' + 'a' * 40}}))
            else:
                request.abort()
        self.context.route('**/*', route)

    def tearDown(self):
        self.page.screenshot(path=str(ARTIFACTS / f'{self._testMethodName}.png'), full_page=True)
        (ARTIFACTS / f'{self._testMethodName}.txt').write_text(self.page.locator('body').inner_text(), encoding='utf8')
        self.context.close()
        self.assertEqual(self.errors, [])

    def open(self, query=''):
        self.page.goto(ORIGIN + '/launch' + query)
        expect(self.page.get_by_role('heading', name='Launch your token', exact=True)).to_be_visible()

    def state(self, key):
        return self.page.evaluate('(key) => window.__DBC_TEST__[key]', key)

    def set_state(self, **values):
        self.page.evaluate('(values) => Object.assign(window.__DBC_TEST__, values)', values)

    def connect(self):
        self.page.get_by_role('button', name='Connect Phantom', exact=True).click()
        expect(self.page.get_by_role('button', name='Disconnect wallet')).to_be_enabled()

    def details(self, manual=True):
        self.page.get_by_label('Token name', exact=True).fill('Mainnet launch test')
        self.page.get_by_label('Ticker', exact=True).fill('TEST')
        if manual:
            self.page.get_by_label('Use an existing metadata URI').check()
            self.page.get_by_label('Metadata URI (HTTPS, IPFS or Arweave)').fill('https://example.com/test.json')

    def review(self):
        self.page.get_by_role('button', name='Review token launch').click()
        expect(self.page.get_by_role('region', name='Review DBC transaction')).to_be_visible()

    def acknowledge(self):
        self.page.get_by_role('checkbox', name='I understand this is Solana mainnet', exact=False).check()

    def test_mainnet_launch_copy_and_open_actions(self):
        self.open()
        self.connect()
        self.details()
        self.review()
        self.assertEqual((self.state('signs'), self.state('sends')), (0, 0))
        expect(self.page.get_by_role('heading', name='Review on Solana mainnet')).to_be_visible()
        expect(self.page.get_by_role('button', name='Launch token with Phantom')).to_be_disabled()
        expect(self.page.get_by_text('0.00006 SOL', exact=True)).to_be_visible()
        self.acknowledge()
        self.page.screenshot(path=str(ARTIFACTS / 'mainnet-review-desktop.png'), full_page=True)
        self.page.get_by_role('button', name='Launch token with Phantom').click()
        expect(self.page.get_by_role('heading', name='Token launched on Solana mainnet')).to_be_visible()
        self.assertEqual((self.state('signs'), self.state('sends')), (1, 1))
        self.assertNotIn('cluster=devnet', self.page.get_by_role('link', name='View transaction', exact=True).get_attribute('href'))
        journal = self.page.evaluate("JSON.parse(localStorage.getItem('kydos.solana.activity.v1'))")
        record = journal['records'][0]
        self.assertEqual(record['state'], 'confirmed')
        self.assertNotIn('secretKey', json.dumps(journal))
        self.page.get_by_role('button', name='Copy token address').click()
        expect(self.page.get_by_role('button', name='Copied', exact=True)).to_be_visible()
        self.assertEqual(self.page.evaluate('navigator.clipboard.readText()'), record['metadata']['mint'])
        self.page.get_by_role('link', name='Open launch', exact=True).click()
        expect(self.page.get_by_text('bonding', exact=True)).to_be_visible()
        self.assertEqual(self.page.get_by_label('Token mint', exact=True).input_value(), record['metadata']['mint'])
        expect(self.page.get_by_role('link', name='View token on Solana mainnet')).to_be_visible()

    def test_image_metadata_retry_avoids_duplicate_uploads(self):
        self.open()
        self.connect()
        self.details(manual=False)
        self.page.get_by_label('Description', exact=True).fill('Public metadata test')
        self.page.get_by_label('Token image (PNG, JPG or WebP, up to 5 MB)').set_input_files({'name': 'token.png', 'mimeType': 'image/png', 'buffer': PNG})
        expect(self.page.get_by_alt_text('Selected token artwork')).to_be_visible()
        self.set_state(failMetadata=True)
        self.page.get_by_role('button', name='Review token launch').click()
        expect(self.page.get_by_role('alert').filter(has_text='Metadata upload interrupted')).to_be_visible()
        self.assertEqual((self.state('images'), self.state('metadata'), self.state('signs')), (1, 1, 0))
        self.set_state(failMetadata=False)
        self.review()
        self.assertEqual((self.state('images'), self.state('metadata'), self.image_posts), (1, 2, 1))
        self.page.get_by_role('button', name='Edit / cancel review').click()
        self.review()
        self.assertEqual((self.state('images'), self.state('metadata'), self.image_posts), (1, 2, 1))
        self.assertEqual(self.state('sends'), 0)

    def test_wallet_rejection_is_not_broadcast_and_review_is_single_use(self):
        self.open()
        self.connect()
        self.details()
        self.review()
        self.set_state(reject=True)
        self.acknowledge()
        self.page.get_by_role('button', name='Launch token with Phantom').click()
        expect(self.page.get_by_role('alert').filter(has_text='User rejected wallet approval')).to_be_visible()
        self.assertEqual((self.state('signs'), self.state('sends')), (1, 0))
        self.review()
        expect(self.page.get_by_role('button', name='Launch token with Phantom')).to_be_disabled()

    def test_ambiguous_submission_blocks_duplicate_after_reload(self):
        self.open()
        self.connect()
        self.details()
        self.review()
        self.set_state(failSend=True)
        self.acknowledge()
        self.page.get_by_role('button', name='Launch token with Phantom').click()
        expect(self.page.get_by_role('alert').filter(has_text='Submission ambiguous')).to_be_visible()
        self.assertEqual(self.state('sends'), 1)
        expect(self.page.get_by_role('button', name='Review token launch')).to_be_disabled()
        self.page.reload()
        self.connect()
        self.details()
        expect(self.page.get_by_role('button', name='Review token launch')).to_be_disabled()
        self.assertEqual((self.state('signs'), self.state('sends')), (0, 0))

    def test_missing_config_shows_form_but_no_launch_authorization(self):
        self.open('?case=unconfigured')
        self.connect()
        self.details()
        expect(self.page.get_by_text('Launch configuration required', exact=True)).to_be_visible()
        expect(self.page.get_by_role('button', name='Review token launch')).to_be_disabled()
        self.assertNotIn('Coming soon', self.page.locator('body').inner_text())
        self.assertEqual(self.state('sends'), 0)

    def test_rpc_network_mismatch_stops_before_upload_or_sign(self):
        self.open('?case=wrong-network')
        self.connect()
        self.details()
        expect(self.page.get_by_role('button', name='Review token launch')).to_be_disabled()
        self.page.get_by_role('button', name='Verify launch readiness').click()
        expect(self.page.get_by_role('alert').filter(has_text='RPC network does not match')).to_be_visible()
        self.assertEqual((self.state('images'), self.state('signs'), self.state('sends')), (0, 0, 0))

    def test_devnet_manifest_cannot_authorize_mainnet_only_operations(self):
        self.open('?case=devnet')
        self.connect()
        self.details()
        expect(self.page.get_by_role('alert').filter(has_text='require Solana mainnet')).to_be_visible()
        expect(self.page.get_by_role('button', name='Review token launch')).to_be_disabled()
        expect(self.page.get_by_role('button', name='Verify launch readiness')).to_be_disabled()
        self.assertEqual((self.state('images'), self.state('signs'), self.state('sends')), (0, 0, 0))

    def test_original_creator_fee_actions_on_mainnet(self):
        self.open()
        fixture = self.state('fixtureMint')
        self.open('?dbcMint=' + fixture + '&network=mainnet-beta')
        expect(self.page.get_by_text('migrated', exact=True)).to_be_visible()
        self.connect()
        self.page.get_by_role('button', name='Review 50/50 settlement and burn').click()
        expect(self.page.get_by_role('region', name='Review DBC transaction')).to_be_visible()
        expect(self.page.get_by_text('Simulated creator payout: 0.00000005 WSOL', exact=True)).to_be_visible()
        expect(self.page.get_by_text('Simulated Kydos payout: 0.00000005 WSOL', exact=True)).to_be_visible()
        self.acknowledge()
        self.page.get_by_role('button', name='Approve fee transaction with Phantom').click()
        expect(self.page.get_by_role('heading', name='Transaction confirmed on Solana mainnet')).to_be_visible()
        self.assertEqual(self.state('sends'), 1)

    def test_insufficient_sol_never_opens_wallet_approval(self):
        self.open()
        self.connect()
        self.details()
        self.set_state(lowBalance=True)
        self.page.get_by_role('button', name='Review token launch').click()
        expect(self.page.get_by_role('alert').filter(has_text='Insufficient SOL')).to_be_visible()
        self.assertEqual((self.state('signs'), self.state('sends')), (0, 0))

    def test_signed_out_user_can_use_hosted_metadata(self):
        self.open('?case=signed-out')
        expect(self.page.get_by_role('link', name='Sign in to upload artwork')).to_be_visible()
        self.connect()
        self.details()
        self.review()
        self.assertEqual(self.state('images'), 0)

    def test_mobile_review_has_no_horizontal_overflow(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.open()
        self.connect()
        self.details()
        self.review()
        self.acknowledge()
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
        expect(self.page.get_by_role('button', name='Launch token with Phantom')).to_be_enabled()
        self.page.screenshot(path=str(ARTIFACTS / 'mainnet-review-mobile.png'), full_page=True)

if __name__ == '__main__':
    unittest.main(verbosity=2)
