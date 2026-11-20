<script setup lang="ts">
import { SearchX } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
</script>

<template>
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
      <EmptyTitle>Página não encontrada</EmptyTitle>
      <EmptyDescription>O endereço pode estar errado ou a página saiu do ar.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><Button as-child><RouterLink to="/" class="no-underline">Ver vagas abertas</RouterLink></Button></EmptyContent>
  </Empty>
</template>
