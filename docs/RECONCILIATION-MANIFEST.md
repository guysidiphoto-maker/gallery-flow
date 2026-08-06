# CPV2 Production Migration Reconciliation — old→new manifest

Root cause: migration numbers 088/089 collided between `main` (download-tracking, applied to Production) and the CPV2 line (client-portal). CPV2 chain renumbered +2 (088→090 … 112→114) to land above Production's applied 089. SQL bodies unchanged (pure rename); content checksums identical before/after.

| old | new | filename (new) | purpose | fwd sha256 (unchanged) | rollback sha256 (unchanged) |
|---|---|---|---|---|---|
| 088 | 090 | `090_client_memberships.sql` | client memberships | `248a55e29ecf…` | `b8fac07bf9b9…` |
| 089 | 091 | `091_business_entitlements.sql` | business entitlements | `200874db1602…` | `4f7f14703136…` |
| 090 | 092 | `092_client_access_audit.sql` | client access audit | `424f702305aa…` | `713121d6ac57…` |
| 091 | 093 | `093_client_portal_rpcs.sql` | client portal rpcs | `9eb206d86c2a…` | `9806d36da760…` |
| 092 | 094 | `094_client_admin_read_rpcs.sql` | client admin read rpcs | `623ed98bb590…` | `1a0ec7861344…` |
| 093 | 095 | `095_cpv2_auth_helpers.sql` | cpv2 auth helpers | `d552bfa35ffd…` | `0a936d1cd6de…` |
| 094 | 096 | `096_bootstrap_entitlements.sql` | bootstrap entitlements | `0da1b84907a3…` | `ec428bb4ceba…` |
| 095 | 097 | `097_client_member_read_policies.sql` | client member read policies | `b0d4cfae8156…` | `c22f8c63401a…` |
| 096 | 098 | `098_onboarding_progress.sql` | onboarding progress | `323be2408842…` | `a24a0bf9f537…` |
| 097 | 099 | `099_gallery_event_metadata.sql` | gallery event metadata | `7cb3fa8f32a9…` | `28566e3078e8…` |
| 098 | 100 | `100_search_rpcs.sql` | search rpcs | `dae805ddb777…` | `de0183ed026b…` |
| 099 | 101 | `101_import_center.sql` | import center | `a3aed851a24f…` | `ffa869ad3860…` |
| 100 | 102 | `102_tender_collections.sql` | tender collections | `29feb1d23d05…` | `4f30682731e5…` |
| 101 | 103 | `103_tender_grants_hardening.sql` | tender grants hardening | `d0fab6d96ad7…` | `209335b29306…` |
| 102 | 104 | `104_portal_client_resolver.sql` | portal client resolver | `37f23afdd484…` | `19337dc43111…` |
| 103 | 105 | `105_rls_initplan_error_hygiene.sql` | rls initplan error hygiene | `32d2ca820754…` | `135f051f0f1f…` |
| 104 | 106 | `106_retire_gallery_paywall.sql` | retire gallery paywall | `f30cb5119532…` | `b53811f1a50a…` |
| 105 | 107 | `107_grid_spacing_allowlist.sql` | grid spacing allowlist | `5e7e4dcb840c…` | `d7d492b6e5b7…` |
| 106 | 108 | `108_gallery_meta_brand_defaults.sql` | gallery meta brand defaults | `108b002682cc…` | `c31fd886e13d…` |
| 107 | 109 | `109_gallery_meta_null_safe.sql` | gallery meta null safe | `66d408db4f41…` | `6b5092405e6e…` |
| 108 | 110 | `110_editor_rpc_grant_hardening.sql` | editor rpc grant hardening | `b5d4dc39232d…` | `8c5e8dab8fc3…` |
| 109 | 111 | `111_gallery_appearance.sql` | gallery appearance | `c981f1bd716a…` | `a2ccada5d6d4…` |
| 110 | 112 | `112_replace_image_rpc.sql` | replace image rpc | `3bc45309a14c…` | `e4f1606acb7d…` |
| 111 | 113 | `113_gallery_presets.sql` | gallery presets | `823628b3af13…` | `60d0a5351e1b…` |
| 112 | 114 | `114_draft_isolation_hardening.sql` | draft isolation hardening | `31b7ecab46ae…` | `a867b9bd4e3f…` |

Note: SQL bodies are byte-identical to the pre-reconciliation files (verified: 0/50 content-checksum changes). Internal SQL header comments retain their pre-reconciliation numbers as historical references (non-executing); no executable migration-number dependency exists in any body. Test readFileSync paths and this branch's docs were updated to the reconciled numbers. The staging artifact `supabase/staging/STAGING_provision_editor_rpcs.sql` is a non-canonical QA provisioning script excluded from Production and left unchanged.
