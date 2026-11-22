<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
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
const termsError = ref("");
const busy = ref(false);

async function requestCode() {
  error.value = /^\S+@\S+\.\S+$/.test(email.value.trim()) ? "" : "Informe um e-mail válido.";
  termsError.value = terms.value ? "" : "Aceite a política de privacidade para continuar.";
  if (error.value || termsError.value) return;
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
  error.value = /^\d{6}$/.test(code.value.trim()) ? "" : "Digite os 6 dígitos do código.";
  if (error.value) return;
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
  <div class="mx-auto flex max-w-md flex-col gap-6 py-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Entrar</h1>
      <p class="mt-1 text-sm text-muted-foreground">Sem senha: mandamos um código de 6 dígitos para o seu e-mail.</p>
    </div>

    <Card class="gap-0 p-6 shadow-none">
      <form v-if="step === 'email'" class="flex flex-col gap-4" novalidate @submit.prevent="requestCode">
        <div class="flex flex-col gap-2">
          <Label for="email">E-mail</Label>
          <Input id="email" v-model="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" :aria-invalid="!!error || undefined" />
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-start gap-2">
            <Checkbox id="terms" v-model="terms" class="mt-0.5" :aria-invalid="!!termsError || undefined" />
            <Label for="terms" class="block text-sm font-normal leading-snug text-muted-foreground">
              Li e aceito a <RouterLink to="/privacidade" class="text-primary">política de privacidade e os termos de uso</RouterLink>.
            </Label>
          </div>
          <p v-if="termsError" class="text-sm text-destructive">{{ termsError }}</p>
        </div>
        <Button type="submit" class="w-full" :disabled="busy"><Spinner v-if="busy" />Receber código</Button>
      </form>

      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="verify">
        <p class="text-sm">Mandamos o código para <b>{{ email }}</b>. Confira também o spam.</p>
        <div class="flex flex-col gap-2">
          <Label for="code">Código</Label>
          <Input id="code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" class="h-10 text-center text-lg tracking-[0.4em]" :aria-invalid="!!error || undefined" />
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        </div>
        <Button type="submit" class="w-full" :disabled="busy"><Spinner v-if="busy" />Entrar</Button>
        <Button type="button" variant="ghost" class="w-full text-muted-foreground" @click="step = 'email'; code = ''; error = ''">Usar outro e-mail</Button>
      </form>

    </Card>
  </div>
</template>
