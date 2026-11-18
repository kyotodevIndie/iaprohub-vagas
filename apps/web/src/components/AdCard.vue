<script setup lang="ts">
import { Card } from "@/components/ui/card";
import type { Ad } from "@/api";

defineProps<{ ad: Ad }>();
</script>

<!-- Anúncio no formato de um card de vaga, com o rótulo "Patrocinado" sempre visível. -->
<template>
  <a :href="ad.url" target="_blank" rel="sponsored noopener" class="group block min-w-0 no-underline">
    <Card class="flex h-full flex-col gap-2 border-dashed bg-transparent p-5 shadow-none transition-colors duration-fast group-hover:border-input">
      <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Patrocinado</span>
      <h2 class="break-words text-base font-semibold leading-snug">{{ ad.title }}</h2>
      <p v-if="ad.text" class="line-clamp-3 text-sm text-muted-foreground">{{ ad.text }}</p>
      <span class="mt-auto pt-1.5 text-sm font-semibold text-primary">{{ ad.cta || "Saiba mais" }} →</span>
    </Card>
  </a>
</template>
