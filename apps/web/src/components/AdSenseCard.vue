<script setup lang="ts">
import { onMounted } from "vue";
import { Card } from "@/components/ui/card";
import { adsense } from "@/lib/adsense";

onMounted(() => {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    /* bloqueador de anúncio: o card fica vazio */
  }
});
</script>

<!-- Bloco do AdSense no lugar de um card de vaga, com o mesmo rótulo "Patrocinado" do anúncio direto. -->
<template>
  <Card v-if="adsense" class="flex min-h-[250px] min-w-0 flex-col gap-2 overflow-hidden border-dashed bg-transparent p-3 shadow-none">
    <span class="px-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Patrocinado</span>
    <ins
      class="adsbygoogle block w-full flex-1"
      :data-ad-client="adsense.client"
      :data-ad-slot="adsense.slot"
      data-ad-format="fluid"
      data-ad-layout-key="-6t+ed+2i-1n-4w"
      data-full-width-responsive="true"
    />
  </Card>
</template>
