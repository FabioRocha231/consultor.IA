/* eslint-env jest, node */
jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: jest.fn().mockResolvedValue(null),
  },
}));

function mockResponse() {
  const response = {};
  response.status = jest.fn(() => response);
  response.send = jest.fn((html) => {
    response.html = html;
    return response;
  });
  return response;
}

function loadGenerator() {
  let MetaGenerator;
  jest.isolateModules(() => {
    MetaGenerator = require("../../utils/boot/MetaGenerator").MetaGenerator;
  });
  return MetaGenerator;
}

async function generatedHtml(url) {
  if (url === undefined) delete process.env.DEPLOYMENT_OG_URL;
  else process.env.DEPLOYMENT_OG_URL = url;

  const MetaGenerator = loadGenerator();
  const response = mockResponse();
  await new MetaGenerator().generate(response);
  return response.html;
}

describe("MetaGenerator", () => {
  afterEach(() => {
    delete process.env.DEPLOYMENT_OG_URL;
  });

  test("uses DEPLOYMENT_OG_URL in og:url and twitter:url", async () => {
    const html = await generatedHtml("https://empresa-a.exemplo.com");

    expect(html).toContain(
      'property="og:url" content="https://empresa-a.exemplo.com"'
    );
    expect(html).toContain(
      'property="twitter:url" content="https://empresa-a.exemplo.com"'
    );
  });

  test("falls back to https://consultor.IA when DEPLOYMENT_OG_URL is unset", async () => {
    const html = await generatedHtml();

    expect(html).toContain('property="og:url" content="https://consultor.IA"');
    expect(html).toContain(
      'property="twitter:url" content="https://consultor.IA"'
    );
  });
});
