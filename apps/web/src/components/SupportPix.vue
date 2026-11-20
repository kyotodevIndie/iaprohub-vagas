<script setup lang="ts">
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Mesmo Pix do FanficBlock (gerado pelo tools/pix.py de lá); o QR em /pix-qr.svg é o mesmo código.
const PIX = "00020126580014br.gov.bcb.pix0136dcb02cde-072b-4b80-bb44-de33fec565025204000053039865802BR5922VICENTE T M CLEMENTINO6006BRASIL62070503***630438CB";

async function copy() {
  try {
    await navigator.clipboard.writeText(PIX);
    toast.success("Pix copiado");
  } catch {
    window.prompt("Copie o Pix copia e cola:", PIX);
  }
}
</script>

<template>
  <section id="apoie" class="mx-auto max-w-6xl px-4 pb-10">
    <Card class="items-center gap-6 p-6 text-center shadow-none sm:flex-row sm:text-left">
      <img src="/pix-qr.svg" alt="QR Code do Pix para apoiar o IAPro Vagas" width="132" height="132" loading="lazy" class="rounded-md" />
      <div class="space-y-2">
        <p class="text-xs font-medium uppercase tracking-wide text-primary">Apoie o projeto</p>
        <h2 class="text-base font-semibold">Achou uma vaga boa por aqui?</h2>
        <p class="text-sm text-muted-foreground">
          O IAPro Vagas é gratuito e vai continuar sendo. Um Pix de qualquer valor ajuda a manter o site no ar. Não pode doar? Mandar o link para quem está procurando vaga já ajuda demais.
        </p>
        <Button size="sm" class="mt-1" @click="copy">Copiar Pix copia e cola</Button>
      </div>
    </Card>
  </section>
</template>
