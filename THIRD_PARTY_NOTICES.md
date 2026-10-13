# Third-party notices

The original application code, documentation and synthetic demo data are MIT licensed. Dependency licenses remain with their respective authors.

- **KaTeX 0.18.10**, copyright 2013–2020 Khan Academy and other contributors, MIT. Used for formula validation and browser rendering; assets and bundled fonts are copied from the pinned npm package during `content:init`. Full notice: [licenses/KaTeX-MIT.txt](licenses/KaTeX-MIT.txt). The package's LICENSE is also copied into generated browser assets.
- Next.js: MIT; React / React DOM: MIT; jose: MIT; Supabase JS / SSR clients: MIT. Exact versions are recorded in package-lock.json; full license notices are distributed in their npm packages.
- markdown-it-py: MIT; jsonschema: MIT. Versions are pinned in requirements-content.txt; installed packages provide their notices.
- Playwright: Apache-2.0, used only for development checks.
- MinerU is an optional, separately installed external tool, not bundled or relicensed by this project. Review the selected CLI/model/service licenses before use.

Existing hosted exam collections, textbooks, scans, private student materials, OCR tasks, credentials and deployment configuration are deliberately excluded from this repository. No license to those materials is granted here.
