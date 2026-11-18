<template>
  <header class="top">
    <div class="container bar">
      <RouterLink to="/" class="brand">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>iaprohub <b>vagas</b></span>
      </RouterLink>
    </div>
  </header>
  <main class="container">
    <RouterView />
  </main>
  <footer class="container foot muted">
    Vagas de tecnologia publicadas nos últimos dias. Cada vaga fica no ar por 3 semanas. A candidatura é feita no site da empresa.
  </footer>
</template>

<style scoped>
.top { border-bottom: 1px solid var(--border); }
.bar { display: flex; align-items: center; height: 60px; }
.brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; font-size: 17px; }
.brand b { color: var(--accent); }
main { padding-top: 28px; padding-bottom: 48px; min-height: 70vh; }
.foot { border-top: 1px solid var(--border); padding-top: 20px; padding-bottom: 32px; font-size: 13px; }
</style>
