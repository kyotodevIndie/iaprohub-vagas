<script setup lang="ts">
import SupportPix from "@/components/SupportPix.vue";
import { loadMe, me } from "@/lib/session";

loadMe();
</script>

<template>
  <header class="border-b border-border">
    <div class="mx-auto flex h-16 max-w-6xl items-center px-4">
      <RouterLink to="/" class="inline-flex items-center gap-2.5 text-lg no-underline">
        <img src="/logo-96.png" alt="" width="40" height="40" />
        <span class="font-semibold tracking-tight">IAPro <b class="text-primary">Vagas</b></span>
      </RouterLink>
      <nav class="ml-auto flex items-center gap-4 text-sm">
        <RouterLink v-if="me?.recruiterStatus === 'aprovado'" to="/recrutador" class="text-muted-foreground no-underline hover:text-foreground">Talentos</RouterLink>
        <RouterLink v-if="me" to="/conta" class="font-medium text-foreground no-underline hover:text-primary">
          Minha conta<span v-if="me.pro" class="ml-1.5 rounded-sm bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">Pro</span>
        </RouterLink>
        <RouterLink v-else-if="me === null" to="/entrar" class="font-medium text-primary no-underline hover:underline">Entrar</RouterLink>
      </nav>
    </div>
  </header>
  <main class="mx-auto min-h-[70vh] max-w-6xl px-4 pb-12 pt-8">
    <RouterView />
  </main>
  <SupportPix />
  <footer class="mx-auto max-w-6xl border-t border-border px-4 pb-8 pt-5 text-sm text-muted-foreground">
    Vagas de tecnologia publicadas nos últimos dias. Cada vaga fica no ar por 3 semanas. A candidatura é feita no site da empresa.
    <RouterLink to="/privacidade" class="ml-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Privacidade</RouterLink>
  </footer>
</template>
