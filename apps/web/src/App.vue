<template>
  <header class="border-b border-border">
    <div class="mx-auto flex h-16 max-w-6xl items-center px-4">
      <RouterLink to="/" class="inline-flex items-center gap-2.5 text-lg no-underline">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>iaprohub <b class="text-primary">vagas</b></span>
      </RouterLink>
    </div>
  </header>
  <main class="mx-auto min-h-[70vh] max-w-6xl px-4 pb-12 pt-8">
    <RouterView />
  </main>
  <footer class="mx-auto max-w-6xl border-t border-border px-4 pb-8 pt-5 text-sm text-muted-foreground">
    Vagas de tecnologia publicadas nos últimos dias. Cada vaga fica no ar por 3 semanas. A candidatura é feita no site da empresa.
  </footer>
</template>
