const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const keyPath =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, `../../storage/comkey`)
    : path.resolve(
        process.env.STORAGE_DIR ?? path.resolve(__dirname, `../../storage`),
        `comkey`
      );

// What does this class do?
// This class generates a hashed version of some text (typically a JSON payload) using a rolling RSA key
// that can then be appended as a header value to do integrity checking on a payload. Given the
// nature of this class and that keys are rolled constantly, this protects the request
// integrity of requests sent to the collector as only the server can sign these requests.
// This keeps accidental misconfigurations of AnythingLLM that leave the collector port open from
// being abused or SSRF'd by users scraping malicious sites who have a loopback embedded in a <script>, for example.
// Since each request to the collector must be signed to be valid, unsigned requests directly to the collector
// will be dropped and must go through the /server endpoint directly.
class CommunicationKey {
  #privKeyName = "ipc-priv.pem";
  #pubKeyName = "ipc-pub.pem";
  #storageLoc = keyPath;

  // Init the class and determine if keys should be rolled.
  // This typically occurs on boot up so key is fresh each boot.
  constructor(generate = false) {
    if (generate) this.#generate();
  }

  log(text, ...args) {
    console.log(`\x1b[36m[CommunicationKey]\x1b[0m ${text}`, ...args);
  }

  #readPrivateKey() {
    return fs.readFileSync(path.resolve(this.#storageLoc, this.#privKeyName));
  }

  #generate() {
    const keyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "pkcs1",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs1",
        format: "pem",
      },
    });

    // Defensive: storage dir may be read-only on shared hosts (Dokploy
    // bind-mounts root-owned). Try mkdir, fall back to a no-op so the
    // boot continues. The writeFileSync calls below will throw if they
    // truly cannot write; the caller (boot/index.js) will then crash
    // with a clearer error than EACCES from mkdir.
    if (!fs.existsSync(this.#storageLoc)) {
      try {
        fs.mkdirSync(this.#storageLoc, { recursive: true });
      } catch (e) {
        this.log(
          "Could not create comkey dir; continuing without persisting RSA keys.",
          e.code || e.message
        );
      }
    }
    // Wrap the file writes too so a missing dir does not crash boot.
    try {
      fs.writeFileSync(
        `${path.resolve(this.#storageLoc, this.#privKeyName)}`,
        keyPair.privateKey
      );
      fs.writeFileSync(
        `${path.resolve(this.#storageLoc, this.#pubKeyName)}`,
        keyPair.publicKey
      );
    } catch (e) {
      this.log(
        "Could not write RSA keys to disk; signing will fail at request time.",
        e.code || e.message
      );
    }
    this.log(
      "RSA key pair generated for signed payloads within AnythingLLM services."
    );
  }

  // This instance of ComKey on server is intended for generation of Priv/Pub key for signing and decoding.
  // this resource is shared with /collector/ via a class of the same name in /utils which does decoding/verification only
  // while this server class only does signing with the private key.
  sign(textData = "") {
    return crypto
      .sign("RSA-SHA256", Buffer.from(textData), this.#readPrivateKey())
      .toString("hex");
  }

  // Use the rolling priv-key to encrypt arbitrary data that is text
  // returns the encrypted content as a base64 string.
  encrypt(textData = "") {
    return crypto
      .privateEncrypt(this.#readPrivateKey(), Buffer.from(textData, "utf-8"))
      .toString("base64");
  }
}

module.exports = { CommunicationKey };
