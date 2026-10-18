# Changelog

## [0.7.0](https://github.com/rotkiv93/studyllm/compare/v0.6.0...v0.7.0) (2026-10-18)


### Features

* **export:** save a chat as .md / .docx / PDF ([951e7ff](https://github.com/rotkiv93/studyllm/commit/951e7ff9e9ceddcb07c746cdb9619b8dedf0da9e))
* **export:** save a chat as .md / .docx / PDF ([a531a8d](https://github.com/rotkiv93/studyllm/commit/a531a8d0d6038db2b032ddffe3fa5a04c2811fad))
* **providers:** free-quota meter ([8d224ed](https://github.com/rotkiv93/studyllm/commit/8d224eda2e6bc5b047402d6b601dd413c9582226))
* **providers:** free-quota meter showing requests used today per provider ([2b93141](https://github.com/rotkiv93/studyllm/commit/2b9314134da1f6b4e356b40addeb0f34e631b844))
* **providers:** local models via Ollama ([b9a8b30](https://github.com/rotkiv93/studyllm/commit/b9a8b3096c11f6ffeaa756ab6b973b6ab2296ba8))
* **providers:** local models via Ollama ([433e157](https://github.com/rotkiv93/studyllm/commit/433e157a41403bdf9196109095dd858fef78cb6b))
* **rag:** page-aware PDF chunks so answers cite [Doc p.12] ([6772728](https://github.com/rotkiv93/studyllm/commit/67727285da9bb9de3dc19a9653013e63bc778c31))
* **rag:** page-aware PDF chunks so answers cite [Doc p.12] ([f045188](https://github.com/rotkiv93/studyllm/commit/f0451888c16b4b0b19ca081c5f3a23bc34e14771)), closes [#5](https://github.com/rotkiv93/studyllm/issues/5)
* **study:** practice quiz generator from Library documents ([e0302cc](https://github.com/rotkiv93/studyllm/commit/e0302cc8ba080d24c293f4cf55c7b7f93ef4777e))
* **study:** practice quiz generator from Library documents ([0b7af5a](https://github.com/rotkiv93/studyllm/commit/0b7af5a28708053fc8dd6fae988d70ab45014425))
* **updater:** in-app auto-update and release-please version bumps ([9b4833a](https://github.com/rotkiv93/studyllm/commit/9b4833a9a026eb3c3f44a7f7dcf99781dc5b4b15))
* **updater:** in-app auto-update via the Tauri updater ([d03cf03](https://github.com/rotkiv93/studyllm/commit/d03cf03990c32fd12ec3203506120d17a8f0ad90))


### Bug Fixes

* **export:** docx in webview, raw IPC bytes, path validation, PDF long words ([f64aa07](https://github.com/rotkiv93/studyllm/commit/f64aa0797600dd58e5c953e019c1a062aa9c7bb0))
* **export:** make PDF long-word splitting linear ([007f1d5](https://github.com/rotkiv93/studyllm/commit/007f1d5382cf6d8c43590d946b7adcdc1a9aedbd))
* **providers:** cap and cache Ollama capability lookups, harden model listing ([c3ae4fd](https://github.com/rotkiv93/studyllm/commit/c3ae4fd9db84339a28d6963f47543578cb048be5))
* **providers:** scope Ollama origins hint, clear caps cache on recheck, add tests ([86e976a](https://github.com/rotkiv93/studyllm/commit/86e976a66228cdde1bd4d1b25ae329a41eaa68ff))
* **style:** restore closing brace lost in merge ([1e0bbe8](https://github.com/rotkiv93/studyllm/commit/1e0bbe871bbf4eb39c0eb40b0329dc7b5018b9c5))


### Documentation

* document auto-update, release flow and one-time setup ([b675424](https://github.com/rotkiv93/studyllm/commit/b67542406680fe916f20831853922c0a4f949ebe))
* document CI checks and tell agents to verify them on PRs ([d3e5ad0](https://github.com/rotkiv93/studyllm/commit/d3e5ad0671502f089375ed526d3c06041e0fabf0))
* **site:** cover Course, Lab bar, OmniRoute, Drive writes and library/RAG; retake screenshots ([1da7a47](https://github.com/rotkiv93/studyllm/commit/1da7a47a942bba3d9e76da4a8ffa0e6e053ab8d6))


### Styling

* **rust:** apply rustfmt and fix clippy warnings ([0939fc5](https://github.com/rotkiv93/studyllm/commit/0939fc5b710bed83aed17091acdc389d3ee21306))
* **rust:** rustfmt code merged from main; document audit ignores ([ced7b0b](https://github.com/rotkiv93/studyllm/commit/ced7b0b123c38492d0d9546e0fa52c9a2717ba4e))


### Build

* **deps:** bump @xmldom/xmldom to clear high-severity advisories ([1f2530e](https://github.com/rotkiv93/studyllm/commit/1f2530e65bf0f50ebd1fc947c86cfc4cbc280485))
* **deps:** bump the cargo-minor-patch group across 1 directory with 11 updates ([b558f1a](https://github.com/rotkiv93/studyllm/commit/b558f1a9b6cd140bb8af23ee3f38f6eaeaafb447))
* **deps:** bump the cargo-minor-patch group across 1 directory with 11 updates ([ffb90b1](https://github.com/rotkiv93/studyllm/commit/ffb90b168b4afc9e1fc621f80dd84fefe4677385))
* **deps:** bump the npm-minor-patch group across 1 directory with 22 updates ([8c68562](https://github.com/rotkiv93/studyllm/commit/8c68562b8c0a923cf4dac001b5edac098be42a29))
* **deps:** bump the npm-minor-patch group across 1 directory with 22 updates ([550dcb5](https://github.com/rotkiv93/studyllm/commit/550dcb5c11f335f8d56576b73da890c6821ea3b6))
* **deps:** patch h2, quinn-proto, rustls; bump zip to 9 ([1e89d70](https://github.com/rotkiv93/studyllm/commit/1e89d70da8b4c7c001c84c56b08d79eff17d9654))


### CI/CD

* add more PR checks (fmt/clippy, 3-OS build, security, commit lint) ([cd764cf](https://github.com/rotkiv93/studyllm/commit/cd764cfb4bde70b19ac1873708e386dee7efd521))
* add rustfmt, clippy, cross-platform build and actionlint ([8ca252e](https://github.com/rotkiv93/studyllm/commit/8ca252e1f889c316e54022d3392f950a257490c2))
* add security scanning and Dependabot ([25710a9](https://github.com/rotkiv93/studyllm/commit/25710a98a3c42cf55c69c954e44e95c3c8bb65bb))
* **deps:** quiet Dependabot — ignore majors, cap PRs, group Actions ([7b2d6e0](https://github.com/rotkiv93/studyllm/commit/7b2d6e00cf4580c0ae59e65f03f8cdd3a5f4446a))
* **deps:** quiet Dependabot — ignore majors, cap PRs, group Actions ([ccc07f1](https://github.com/rotkiv93/studyllm/commit/ccc07f1482cb1d4bcaf63dcddf7c6a9a9fd24b71))
* enforce Conventional Commits on PRs, add labeler and PR template ([091732b](https://github.com/rotkiv93/studyllm/commit/091732b936dec6a4fa9f146cb27a607746b7d786))
* **release:** automate version bumps with release-please ([b54337c](https://github.com/rotkiv93/studyllm/commit/b54337c8c7883d6385b3d746cfea45915819e61d))
* **release:** find the release PR by label so Cargo.lock sync always runs ([43ecd7e](https://github.com/rotkiv93/studyllm/commit/43ecd7ef5a6ca744aa37c2d05c945f0f9edf1b7b))
* **release:** find the release PR by label so Cargo.lock sync always runs ([2569b94](https://github.com/rotkiv93/studyllm/commit/2569b9431dcf4539fb2012ba86c56156c0f19461))
* **release:** keep Cargo.lock version in sync on the release PR ([49c12b4](https://github.com/rotkiv93/studyllm/commit/49c12b49c756d8063d7763c40c601f8a051ec47d))
* **release:** keep Cargo.lock version in sync on the release PR ([219a87d](https://github.com/rotkiv93/studyllm/commit/219a87d9ad6d35082768a40e0c8a63580f9f3651))
