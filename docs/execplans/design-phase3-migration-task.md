# Design 模块（Phase 3）迁移 ExecPlan

本 ExecPlan 是活文档。`Progress`、`Surprises & Discoveries`、`Decision Log`、`Outcomes & Retrospective` 四个章节必须随着工作推进持续更新。

本文件按仓库根目录 `docs/PLANS.md` 维护。

## Purpose / Big Picture

目标是把旧仓库 `~/work/github/metacode-node` 的 NestJS `design` 模块迁移到当前仓库的 Fastify + tRPC 架构，让“应用设计态”能力在新后端可直接调用并可回归验证。迁移完成后，调用方可以通过 `design` 路由完成应用、分支、页面、视图、数据权限、部署历史与回滚相关操作，不再依赖旧 NestJS 控制器。

## Progress

- [x] (2026-04-23 17:12) 完成第三阶段范围确认：核对 `MIGRATION_PLAN.md` 与旧仓库 `src/design/*`，明确接口与服务迁移边界。
- [x] (2026-04-23 17:18) 创建本 ExecPlan，定义迁移顺序、验证方式和验收标准。
- [x] (2026-04-23 17:26) 新增 `server/src/modules/design/{dto.ts,design.service.ts,design.router.ts,index.ts}`，完成 design 资源域迁移（apps/branches/items/views/dataAuthorizations/deployment）。
- [x] (2026-04-23 17:27) 将 `designRouter` 挂载到 `server/src/rpc/router.ts`，并修复 OpenAPI path/method 自动注入逻辑。
- [x] (2026-04-23 17:31) 新增 `server/test/design.test.ts`，覆盖应用生命周期、分支克隆、视图历史恢复、部署与恢复。
- [x] (2026-04-23 17:32) 对变更文件执行 `eslint --fix`，修复迁移代码 TypeScript 问题并完成目标文件级类型检查。
- [x] (2026-04-23 17:33) 执行并记录 `server/test/design.test.ts`，4 条用例全部通过。

## Surprises & Discoveries

- Observation: 旧仓库 `design.service.ts` 内部存在大量“跨表批量写入”逻辑（部署/恢复），直接照搬会有一致性风险。
  Evidence: `deployApp` 与 `restoreApp` 同时读写 `md_*` 定义态表与 `app_*` 运行态表，且涉及多次 delete/create。
- Observation: 当前新仓库 `rpc/router.ts` 仅挂载 `auth` 与 `health`，`design` 迁移后需要新增一级命名空间。
  Evidence: `server/src/rpc/router.ts` 仍保留 “TODO: migrate these modules from metacode-node” 注释。
- Observation: 迁移后第一次执行测试出现 `trpc-to-openapi` 未处理异常，根因是嵌套路由 procedure 的 openapi path/method 没有被默认填充到扁平 procedure 表。
  Evidence: `TypeError: Cannot read properties of undefined (reading 'replace')` 出现在 `normalizePath(openapi.path)`，随后通过按 `appRouter._def.procedures` 回填默认值解决。

## Decision Log

- Decision: 第三阶段只迁移后端 Design 模块（含 server e2e），不在本次引入 Runtime/App-Template。
  Rationale: 用户明确要求迁移“第三阶段”，对应 `MIGRATION_PLAN.md` 中的 Design 范围。
  Date/Author: 2026-04-23 / Codex
- Decision: 设计态写操作统一通过事务封装，尤其 deploy/restore/branch-clone。
  Rationale: 旧实现跨多表写入，事务可避免部分成功导致的定义态与运行态不一致。
  Date/Author: 2026-04-23 / Codex
- Decision: 保持旧接口语义分组，但以 tRPC 输入对象替代 REST path/query 参数拆分。
  Rationale: 当前仓库统一通过 `trpc/client` 调用，输入对象更稳定且便于测试。
  Date/Author: 2026-04-23 / Codex
- Decision: OpenAPI 默认 path/method 的补全逻辑改为基于 `appRouter._def.procedures` 的扁平遍历，而不是递归 `routes` 对象。
  Rationale: `trpc-to-openapi` 读取的就是扁平 procedure 表，直接在该层补全可避免嵌套路由遗漏。
  Date/Author: 2026-04-23 / Codex

## Outcomes & Retrospective

本次第三阶段迁移已落地并完成可运行验证。已交付内容包括：`design` 模块完整路由（apps/branches/items/views/dataAuthorizations/deployment）、对应 service 迁移实现、事务化关键写路径（branch clone/view restore/deploy/restore）、以及覆盖四条核心业务链路的 server e2e 测试。  
未在本次处理的内容是仓库已有 `.bak` 模块的全量类型报错（`file.bak/tag.bak/user.bak`），这些问题在本次迁移前已存在，且不属于第三阶段范围。

## Context and Orientation

当前仓库后端入口在 `server/src/app.ts`，tRPC 主路由在 `server/src/rpc/router.ts`，鉴权过程定义在 `server/src/rpc/trpc.ts` 与 `server/src/rpc/context.ts`。第三阶段迁移目标来自旧仓库 `~/work/github/metacode-node/src/design/`，核心文件是 `design.controller.ts`（REST 接口定义）与 `design.service.ts`（业务逻辑）。

本次迁移会在当前仓库新建 `server/src/modules/design/`。术语说明：文档中的“定义态”指 `md_app_*` 系列表；“运行态”指 `app/app_item/app_view/app_data_authorization` 等部署后表；“部署快照”指 `md_app_deployment_history.configuration` 保存的 JSON 内容。

## Plan of Work

先建立 `design/dto.ts`，把旧 DTO 输入迁移为 Zod schema，并导出 TypeScript 输入类型；输出保持兼容旧字段结构。然后迁移 `design.service.ts`：先实现 app/branch/item/view/dataAuthorization 的 CRUD，再实现 `deployApp/restoreApp` 和视图历史恢复；在多表写入处统一使用事务。之后实现 `design.router.ts`，按资源域分组过程并接入 `authedProcedure`。完成模块后在 `server/src/rpc/router.ts` 挂载 `design` 路由。最后补充 `server/test/design.test.ts` 做集成验证，覆盖四个关键场景：应用生命周期、分支克隆、视图历史恢复、部署与恢复。

## Concrete Steps

在仓库根目录执行：

1. `pnpm eslint --fix server/src/modules/design/dto.ts server/src/modules/design/design.service.ts server/src/modules/design/design.router.ts server/src/modules/design/index.ts server/src/rpc/router.ts server/test/design.test.ts`
2. `pnpm --filter ./server exec tsc --noEmit`
3. `pnpm --filter ./server exec tsc --noEmit --ignoreConfig --target ESNext --module ESNext --moduleResolution bundler --types node --strict --esModuleInterop --isolatedModules --skipLibCheck --resolveJsonModule src/modules/design/dto.ts src/modules/design/design.service.ts src/modules/design/design.router.ts src/modules/design/index.ts src/rpc/router.ts`
4. `pnpm --filter ./server test:e2e test/design.test.ts`

若第 4 步因本地数据库测试数据冲突失败，先清理测试生成的 `md_app_*` 与 `app_*` 临时记录，再重跑。

## Validation and Acceptance

验收标准：

1. `design` 路由在 `server/src/rpc/router.ts` 已挂载，服务可启动。
2. `server/test/design.test.ts` 通过并验证：
   - 应用创建/查询/更新/删除闭环可用；
   - 分支克隆后可见克隆的 item/view；
   - 视图更新后可通过 history restore 回滚；
   - deploy 写入运行态后，可通过 deployment restore 回滚定义态。
3. `pnpm --filter ./server test:e2e test/design.test.ts` 通过，且无未处理异常。
4. 对本次新增/修改的 design 相关文件执行目标文件级 TypeScript 检查通过（仓库内 `.bak` 历史文件的既有报错不计入本次迁移结果）。

## Idempotence and Recovery

迁移步骤是增量式文件新增/挂载，可重复执行。若中途失败：

1. 先修复对应文件再重复执行 lint 与类型检查。
2. 若测试中断，按测试清理逻辑删除本轮创建的 `appId` 相关数据后重跑。
3. 本次不修改 Prisma schema，不涉及数据库迁移脚本执行。

## Artifacts and Notes

关键命令执行摘要：

    pnpm eslint --fix server/src/modules/design/dto.ts server/src/modules/design/design.service.ts server/src/modules/design/design.router.ts server/src/modules/design/index.ts server/src/rpc/router.ts server/test/design.test.ts
    => 通过

    pnpm --filter ./server exec tsc --noEmit
    => 失败（仅剩历史 .bak 模块报错：file.bak/tag.bak/user.bak）

    pnpm --filter ./server exec tsc --noEmit --ignoreConfig --target ESNext --module ESNext --moduleResolution bundler --types node --strict --esModuleInterop --isolatedModules --skipLibCheck --resolveJsonModule src/modules/design/dto.ts src/modules/design/design.service.ts src/modules/design/design.router.ts src/modules/design/index.ts src/rpc/router.ts
    => 通过（本次迁移文件类型检查通过）

    pnpm --filter ./server test:e2e test/design.test.ts
    => 1 file passed, 4 tests passed

## Interfaces and Dependencies

新增接口位于 `design` 命名空间，保持以下资源域：

- `design.apps.*`
- `design.branches.*`
- `design.items.*`
- `design.views.*`
- `design.dataAuthorizations.*`
- `design.deployment.*`

实现依赖：

- `@trpc/server` 的 `router` 与 `authedProcedure`
- `zod` 输入校验
- `server/src/lib/prisma.ts` 提供的 PrismaClient
- `server/src/generated/prisma/enums.ts` 枚举常量

---

Revision Note (2026-04-23): 初版 ExecPlan，覆盖第三阶段迁移范围、步骤和验收标准。
Revision Note (2026-04-23): 完成第三阶段代码迁移与验证，补充 OpenAPI 异常修复和测试证据。
