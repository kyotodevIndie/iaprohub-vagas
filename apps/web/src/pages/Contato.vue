<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { errorMessage, get, send } from "@/api";

document.title = "Pedido de contato | IAPro Vagas";

const token = useRoute().params.token as string;
const req = ref<{ company: string; message: string; status: "pendente" | "aceito" | "recusado" } | null>(null);
const state = ref<"loading" | "ok" | "missing">("loading");
const error = ref("");

onMounted(async () => {
  try {
    req.value = await get(`/api/v1/contact/${encodeURIComponent(token)}`);
    state.value = "ok";
  } catch {
    state.value = "missing";
  }
});

async function answer(decision: "aceitar" | "recusar") {
  error.value = "";
  try {
    const r = await send<{ status: "aceito" | "recusado" }>("POST", `/api/v1/contact/${encodeURIComponent(token)}`, { decision });
    req.value!.status = r.status;
  } catch (err) {
    error.value = errorMessage(err);
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl py-6">
    <p v-if="state === 'loading'" class="text-muted-foreground">Carregando...</p>
    <p v-else-if="state === 'missing'" class="text-muted-foreground">Pedido não encontrado.</p>
    <template v-else-if="req">
      <h1 class="text-2xl font-bold tracking-tight">{{ req.company }} quer falar com você</h1>
      <Card class="mt-5 whitespace-pre-line p-5 text-foreground/90 shadow-none">{{ req.message }}</Card>
      <div v-if="req.status === 'pendente'" class="mt-5 space-y-3">
        <p class="text-sm text-muted-foreground">Se aceitar, mandamos ao recrutador o seu nome, e-mail, telefone e LinkedIn do perfil. Se recusar, ele não recebe nada.</p>
        <div class="flex gap-2">
          <Button @click="answer('aceitar')">Aceitar e mandar meu contato</Button>
          <Button variant="outline" @click="answer('recusar')">Recusar</Button>
        </div>
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      </div>
      <p v-else-if="req.status === 'aceito'" class="mt-5 text-primary">Contato enviado ao recrutador ✓</p>
      <p v-else class="mt-5 text-muted-foreground">Pedido recusado. O recrutador não recebeu seus dados.</p>
    </template>
  </div>
</template>
