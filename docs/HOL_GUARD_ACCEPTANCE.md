# HOL Guard integration acceptance plan

Status: design-only acceptance plan for Issue #7. Every case below is `NOT_RUN` until a maintainer-approved Guard contract exists. These cases do not replace the historical 68-row prototype matrix or the historical 70/70 prototype Rust result.

Baseline for this plan:
- ARC main: `c42000412f2663f893ba7382d12a3e027de061a1`
- audited HOL Guard: `9260647758487a12381fbec31d53b65dd8106340`

## A. Restriction-only composition

| ID | Case | Required result |
| --- | --- | --- |
| ARC-HG-01 | Guard allows, ARC has no additional restriction | preserve Guard result; ARC does not manufacture authority |
| ARC-HG-02 | Guard allows, ARC blocks | final block |
| ARC-HG-03 | Guard review, ARC has no additional restriction | review remains review |
| ARC-HG-04 | Guard review, ARC blocks | final block |
| ARC-HG-05 | Guard require-reapproval, ARC has no additional restriction | require-reapproval remains |
| ARC-HG-06 | Guard sandbox-required, ARC has no additional restriction | sandbox-required remains |
| ARC-HG-07 | Guard blocks, ARC has no additional restriction | block remains |
| ARC-HG-08 | Any ARC input attempts to express allow/review/sandbox/approval authority | reject contract/input |

## B. Presence, identity and scope

| ID | Case | Required result |
| --- | --- | --- |
| ARC-HG-09 | Required context missing | fail closed |
| ARC-HG-10 | Optional context has authenticated explicit absence | no additional ARC floor |
| ARC-HG-11 | Optional context malformed/stale/revoked | fail closed; do not reinterpret as absence |
| ARC-HG-12 | ARC subject digest mismatches current task/action subject | reject |
| ARC-HG-13 | actor/session binding mismatches current authenticated principal | reject |
| ARC-HG-14 | workspace/scope binding mismatches Guard current scope | reject |
| ARC-HG-15 | write target outside admitted ARC scope | block before effect |
| ARC-HG-16 | ARC path text claims in-scope but Guard canonical target is out-of-scope | block using Guard canonical target |

## C. Freshness, replacement and revocation

| ID | Case | Required result |
| --- | --- | --- |
| ARC-HG-17 | install revision N then N-1 | reject downgrade |
| ARC-HG-18 | same revision reused with different restriction digest | reject reuse |
| ARC-HG-19 | N replaced by N+1 | N can never become current again |
| ARC-HG-20 | current context revoked | subsequent protected action fails closed |
| ARC-HG-21 | restart after replacement/revocation | retained floor prevents rollback to older/permissive state |
| ARC-HG-22 | crash/partial mutation between authority marker and admitted state | recover fail closed; never expose mixed policy/restriction state |

## D. Approval freshness and replay

| ID | Case | Required result |
| --- | --- | --- |
| ARC-HG-23 | approval challenge created under N; N replaced before consume | consume rejected |
| ARC-HG-24 | approval challenge created under N; N revoked before consume | consume rejected |
| ARC-HG-25 | approval reused for different actor/session/workspace | rejected |
| ARC-HG-26 | approval reused for different canonical action target | rejected |
| ARC-HG-27 | valid approval exists but ARC floor is Block | approval cannot override block |
| ARC-HG-28 | mutation races challenge creation/consumption | coherent old or new state only; no mixed acceptance |

## E. Receipt and evidence

| ID | Case | Required result |
| --- | --- | --- |
| ARC-HG-29 | ARC governed decision | canonical decision identity binds privacy-safe ARC restriction identity |
| ARC-HG-30 | old receipt from N inspected after N+1 | may remain historical evidence but is not current authority |
| ARC-HG-31 | raw role body, credentials or file contents present in receipt | reject/redact according to Guard receipt contract |
| ARC-HG-32 | receipt identity differs only because governing ARC restriction differs | decision identity must differ |
| ARC-HG-33 | ARC did not govern decision because Optional absence was authenticated | receipt can distinguish explicit absence from ARC-present state without inventing authority |

## F. Execution boundary

| ID | Case | Required result |
| --- | --- | --- |
| ARC-HG-34 | cooperative direct write through supported Guard interception | pre-effect restriction evaluated against canonical target |
| ARC-HG-35 | child process or uninstrumented code writes after decision | must not be claimed covered unless a mandatory execution/filesystem mediator exists |
| ARC-HG-36 | restriction revoked after decision but before mediated effect | effect rejected if the selected production guarantee extends through completion |
| ARC-HG-37 | write succeeds/fails at OS boundary | decision receipt alone must not be described as proof of write completion |

## Exit gate

Production integration is accepted only when:
1. maintainers choose the state ownership and enforcement boundary;
2. the contract is versioned and Guard-owned;
3. the restriction-only lattice is mechanically closed against grants;
4. all applicable cases above run against one exact HOL Guard candidate HEAD;
5. required native/platform CI passes on that exact HEAD;
6. independent review checks authority confusion, rollback/replay, approval freshness and receipt privacy;
7. ARC documentation continues to state that ARC declaration validation itself does not grant runtime authority.
