<script setup lang="ts">
import { Button } from "@/components/ui/button";
</script>

<template>
  <div class="space-y-4 py-10">
    <h1 class="text-2xl font-bold">Página não encontrada</h1>
    <Button as-child><RouterLink to="/" class="no-underline">Ver vagas abertas</RouterLink></Button>
  </div>
</template>
