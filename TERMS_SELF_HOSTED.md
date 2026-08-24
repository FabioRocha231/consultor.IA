# consultor.IA Self-Hosted: Data Privacy & Terms of Service

This document outlines the privacy standards, data handling procedures, and licensing terms for the self-hosted version of consultor.IA.

## 1. Data Sovereignty & Local-First Architecture
consultor.IA is designed as a **local-first** application. When utilizing the self-hosted version (Docker or Source):
* **No External Access:** The maintainers of this fork do not host, store, or have access to any documents, chat histories, workspace settings, or embeddings created within your instance.
* **On-Premise Storage:** All data resides strictly on the infrastructure provisioned and managed by the user or their organization.
* **Air-Gap Capability:** consultor.IA can be operated in a strictly air-gapped environment with no internet connectivity, provided local LLM and Vector database providers (e.g., Ollama, LocalAI, LanceDB) are utilized.

## 2. Third-Party Integrations
consultor.IA allows users to connect to external services (e.g., OpenAI, Anthropic, Pinecone).
* **Data Transmission:** When these services are enabled, data is transmitted directly from your instance to the third-party provider.
* **Governing Terms:** Data handled by third-party providers is subject to their respective Terms of Service and Privacy Policies. The project maintainers are not responsible for the data practices of these external entities.

_by default, consultor.IA does **everything locally first** - so you would have to manually configure and enable these integrations to be subject to third party terms._

## 3. Security & Network
* **No "Phone Home":** The software does not require an external connection to project maintainers' servers to function.
* **Environment Security:** The user is responsible for securing the host environment, including network firewalls, SSL/TLS encryption, and access control for the consultor.IA instance.
* **Model Assets:** As a convenience, the software may download default embedder and reranking model assets from a configured provider as a fallback. For air-gapped installations, configure local model providers or download the assets manually. Assets of this nature are downloaded once and cached in your associated local storage.

## 4. Licensing and Liability
* **License:** The consultor.IA software is provided under the **MIT License**.
* **No Warranty:** As per the license agreement, the software is provided "as is," without warranty of any kind, express or implied, including but not limited to the warranties of merchantability or fitness for a particular purpose.
* **Liability:** In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from the use of the software.

## 5. Support and Compatibility
While the project maintainers prioritize stability and backward compatibility, the self-hosted version is used at the user's discretion. Formal Service Level Agreements (SLAs) are not provided for the standard self-hosted version unless otherwise negotiated via a separate agreement.

## 6. License and Attribution

consultor.IA is based on AnythingLLM, originally developed by Mintplex Labs, under the MIT License. The original copyright and license text are preserved in [LICENSE](./LICENSE). Third-party services used by the software are governed by their own terms.

---
*Last Updated: August 2026*
