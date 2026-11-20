# AGENTS.md

## Interface

- O front (`apps/web`) usa Vue 3 + Tailwind 4 + shadcn-vue e segue `~/dev/nox-design/padroes.md`.
- Componentes vêm do shadcn-vue (`npx shadcn-vue@latest add <nome>` de dentro de `apps/web`) e ficam em
  `src/components/ui`. Depois de cada `add`, troque `from "cn"` por `from "@/lib/utils"` e rode `pnpm remove cn`.
- Identidade só em `src/styles/theme.css`; nas telas, só tokens semânticos (`bg-card`, `text-muted-foreground`...).
  O site é só escuro: `class="dark"` fica no `<html>`.
- Confira telas novas ou alteradas com `/design-review`.
