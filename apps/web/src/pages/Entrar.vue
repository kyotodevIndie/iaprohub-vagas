<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, send } from "@/api";
import { loadMe } from "@/lib/session";

document.title = "Entrar | IAPro Vagas";

const route = useRoute();
const router = useRouter();
const step = ref<"email" | "code">("email");
const email = ref("");
const code = ref("");
const terms = ref(false);
const error = ref("");
const busy = ref(false);

async function requestCode() {
  error.value = "";
  busy.value = true;
  try {
    await send("POST", "/api/v1/auth/code", { email: email.value.trim() });
    step.value = "code";
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function verify() {
  error.value = "";
  busy.value = true;
  try {
    await send("POST", "/api/v1/auth/verify", { email: email.value.trim(), code: code.value.trim(), acceptTerms: true });
    await loadMe();
    const next = typeof route.query.next === "string" && route.query.next.startsWith("/") ? route.query.next : "/conta";
    router.replace(next);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md py-6">
    <h1 class="text-2xl font-bold tracking-tight">Entrar</h1>
    <p class="mt-1 text-muted-foreground">Sem senha: mandamos um código de 6 dígitos para o seu e-mail.</p>

    <Card class="mt-6 p-5 shadow-none">
      <form v-if="step === 'email'" class="space-y-4" @submit.prevent="requestCode">
        <div class="space-y-1.5">
          <Label for="email">E-mail</Label>
          <Input id="email" v-model="email" type="email" required autocomplete="email" placeholder="voce@exemplo.com" />
        </div>
        <label class="flex items-start gap-2 text-sm text-muted-foreground">
          <input v-model="terms" type="checkbox" required class="mt-0.5 accent-[hsl(var(--primary))]" />
          <span>Li e aceito a <RouterLink to="/privacidade" class="text-primary">política de privacidade e os termos de uso</RouterLink>.</span>
        </label>
        <Button type="submit" class="w-full" :disabled="busy || !terms">{{ busy ? "Enviando..." : "Receber código" }}</Button>
      </form>

      <form v-else class="space-y-4" @submit.prevent="verify">
        <p class="text-sm">Mandamos o código para <b>{{ email }}</b>. Confira também o spam.</p>
        <div class="space-y-1.5">
          <Label for="code">Código</Label>
          <Input id="code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\d{6}" required placeholder="000000" class="text-center text-lg tracking-[0.4em]" />
        </div>
        <Button type="submit" class="w-full" :disabled="busy || code.length !== 6">{{ busy ? "Entrando..." : "Entrar" }}</Button>
        <button type="button" class="w-full text-sm text-muted-foreground hover:text-foreground" @click="step = 'email'; code = ''">Usar outro e-mail</button>
      </form>

      <p v-if="error" class="mt-3 text-sm text-destructive">{{ error }}</p>
    </Card>
  </div>
</template>
