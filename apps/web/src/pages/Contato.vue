<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { SearchX } from "@lucide/vue";
import { toast } from "vue-sonner";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, get, send } from "@/api";

document.title = "Pedido de contato | IAPro Vagas";

const token = useRoute().params.token as string;
const req = ref<{ company: string; message: string; status: "pendente" | "aceito" | "recusado" } | null>(null);
const state = ref<"loading" | "ok" | "missing">("loading");
const busy = ref<"aceitar" | "recusar" | null>(null);

onMounted(async () => {
  try {
    req.value = await get(`/api/v1/contact/${encodeURIComponent(token)}`);
    state.value = "ok";
  } catch {
    state.value = "missing";
  }
});

async function answer(decision: "aceitar" | "recusar") {
  busy.value = decision;
  try {
    const r = await send<{ status: "aceito" | "recusado" }>("POST", `/api/v1/contact/${encodeURIComponent(token)}`, { decision });
    req.value!.status = r.status;
  } catch (err) {
    toast.error(`Não foi possível responder o pedido. ${errorMessage(err)}`);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl py-6">
    <div v-if="state === 'loading'" class="flex flex-col gap-4" aria-busy="true">
      <Skeleton class="h-8 w-2/3" />
      <Skeleton class="h-32 rounded-xl" />
    </div>
    <Empty v-else-if="state === 'missing'">
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
        <EmptyTitle>Pedido não encontrado</EmptyTitle>
        <EmptyDescription>O link pode ter expirado. Confira se abriu o link certo do e-mail.</EmptyDescription>
      </EmptyHeader>
    </Empty>
    <div v-else-if="req" class="flex flex-col gap-6">
      <h1 class="text-2xl font-semibold tracking-tight">{{ req.company }} quer falar com você</h1>
      <Card class="whitespace-pre-line p-6 text-sm text-foreground/90 shadow-none">{{ req.message }}</Card>
      <div v-if="req.status === 'pendente'" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">Se aceitar, mandamos ao recrutador o seu nome, e-mail, telefone e LinkedIn do perfil. Se recusar, ele não recebe nada.</p>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" :disabled="!!busy" @click="answer('recusar')"><Spinner v-if="busy === 'recusar'" />Recusar pedido</Button>
          <Button :disabled="!!busy" @click="answer('aceitar')"><Spinner v-if="busy === 'aceitar'" />Aceitar e mandar meu contato</Button>
        </div>
      </div>
      <p v-else-if="req.status === 'aceito'" class="text-sm text-primary">Contato enviado ao recrutador.</p>
      <p v-else class="text-sm text-muted-foreground">Pedido recusado. O recrutador não recebeu seus dados.</p>
    </div>
  </div>
</template>
