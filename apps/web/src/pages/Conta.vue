<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Check } from "@lucide/vue";
import { toast } from "vue-sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ago, date, errorMessage, get, label, send, type Application, type Profile } from "@/api";
import { loadMe, me, myProfile } from "@/lib/session";

document.title = "Minha conta | IAPro Vagas";

const router = useRouter();
const SENIORITIES = ["estagio", "junior", "pleno", "senior", "especialista", "lideranca"];
const WORKPLACES = ["remoto", "hibrido", "presencial"];

const form = reactive({
  name: "",
  phone: "",
  linkedin: "",
  headline: "",
  currentCompany: "",
  summary: "",
  region: "",
  seniority: [] as string[],
  workplace: [] as string[],
  stack: "",
  salaryMin: "",
  visibility: "anonimo" as Profile["visibility"],
  consents: { talentBank: false, autoApply: false, alerts: false },
});
const saving = ref(false);
const cvError = ref("");
const uploading = ref(false);
const applications = ref<Application[]>([]);
const company = ref("");
const recruiterError = ref("");
const recruiterBusy = ref(false);
const pix = ref<{ copyPaste: string; qrBase64: string } | null>(null);
const billingInfo = ref("");
const billingBusy = ref(false);

function fill(p: Profile | null) {
  if (!p) return;
  Object.assign(form, {
    name: p.name ?? "",
    phone: p.phone ?? "",
    linkedin: p.linkedin ?? "",
    headline: p.headline ?? "",
    currentCompany: p.currentCompany ?? "",
    summary: p.summary ?? "",
    region: p.region ?? "",
    seniority: [...p.seniority],
    workplace: [...p.workplace],
    stack: p.stack.join(", "),
    salaryMin: p.salaryMin ? String(p.salaryMin) : "",
    visibility: p.visibility === "oculto" ? "anonimo" : p.visibility,
    consents: { ...p.consents },
  });
}

watch(
  me,
  (m) => {
    if (m === null) router.replace("/entrar?next=/conta");
  },
  { immediate: true },
);
watch(myProfile, fill, { immediate: true });

onMounted(async () => {
  try {
    applications.value = (await get<{ items: Application[] }>("/api/v1/me/applications")).items;
  } catch {
    /* sem login: o watch acima redireciona */
  }
});

const toggle = (list: string[], v: string) => {
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  else list.push(v);
};
const pill =
  "h-8 rounded-full border-border px-3 font-normal text-muted-foreground shadow-none data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90";

async function save() {
  saving.value = true;
  try {
    const salary = Number(form.salaryMin.replace(/\D/g, ""));
    const r = await send<{ profile: Profile }>("PUT", "/api/v1/me/profile", {
      ...form,
      stack: form.stack.split(",").map((s) => s.trim()).filter(Boolean),
      salaryMin: salary > 0 ? salary : null,
    });
    myProfile.value = r.profile;
    toast.success("Perfil salvo");
  } catch (err) {
    toast.error(`Não foi possível salvar o perfil. ${errorMessage(err)}`);
  } finally {
    saving.value = false;
  }
}

async function uploadCv(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!file) return;
  cvError.value = "";
  if (file.size > 3 * 1024 * 1024) return void (cvError.value = "O PDF precisa ter até 3 MB.");
  uploading.value = true;
  try {
    const r = await send<{ profile: Profile }>("PUT", "/api/v1/me/cv", file, {
      "content-type": "application/pdf",
      "x-filename": encodeURIComponent(file.name),
    });
    myProfile.value = r.profile;
    toast.success("Currículo enviado");
  } catch (err) {
    toast.error(`Não foi possível enviar o PDF. ${errorMessage(err)}`);
  } finally {
    uploading.value = false;
  }
}

async function removeCv() {
  try {
    myProfile.value = (await send<{ profile: Profile }>("DELETE", "/api/v1/me/cv")).profile;
    toast.success("Currículo removido");
  } catch (err) {
    toast.error(`Não foi possível remover o currículo. ${errorMessage(err)}`);
  }
}

async function subscribe(method: "pix" | "card") {
  billingBusy.value = true;
  billingInfo.value = "";
  try {
    const r = await send<{ initPoint?: string; charge?: { pix: { copyPaste: string; qrBase64: string } } | null; nextChargeAt?: string | null }>(
      "POST",
      "/api/v1/me/billing/checkout",
      { method },
    );
    if (r.initPoint) window.location.href = r.initPoint;
    else if (r.charge) pix.value = r.charge.pix;
    else if (r.nextChargeAt) billingInfo.value = `Seu Pix sai em ${date(r.nextChargeAt)}. Avisamos por e-mail.`;
  } catch (err) {
    toast.error(`Não foi possível iniciar a assinatura. ${errorMessage(err)}`);
  } finally {
    billingBusy.value = false;
  }
}

async function copyPix() {
  if (!pix.value) return;
  try {
    await navigator.clipboard.writeText(pix.value.copyPaste);
    toast.success("Pix copiado");
  } catch {
    toast.error("Não foi possível copiar. Use o QR Code.");
  }
}

async function askRecruiter() {
  recruiterError.value = company.value.trim().length < 2 ? "Informe o nome da empresa." : "";
  if (recruiterError.value) return;
  recruiterBusy.value = true;
  try {
    await send("POST", "/api/v1/me/recruiter", { company: company.value });
    await loadMe();
    toast.success("Pedido enviado");
  } catch (err) {
    toast.error(`Não foi possível enviar o pedido. ${errorMessage(err)}`);
  } finally {
    recruiterBusy.value = false;
  }
}

async function logout() {
  await send("POST", "/api/v1/auth/logout");
  await loadMe();
  router.push("/");
}

async function deleteAccount() {
  try {
    await send("DELETE", "/api/v1/me");
    await loadMe();
    toast.success("Conta excluída");
    router.push("/");
  } catch (err) {
    toast.error(`Não foi possível excluir a conta. ${errorMessage(err)}`);
  }
}

const statusText = computed(() => {
  const m = me.value;
  if (!m?.billingStatus) return null;
  const until = m.paidUntil ? date(m.paidUntil) : null;
  return { trial: "Em teste", active: until ? `Ativo até ${until}` : "Ativo", past_due: "Pagamento pendente", canceled: "Cancelado" }[m.billingStatus];
});
const channelText = (a: Application) =>
  a.channel === "email" ? (a.status === "enviado" ? `CV enviado para ${a.toEmail}` : a.status === "falhou" ? "Falhou o envio" : "Na fila de envio") : a.status === "enviado" ? "Foi no alerta" : "Vai no próximo alerta";
const PERKS = [
  "Envio automático do seu currículo para as vagas que batem com o seu perfil e têm e-mail de contato (até 5 por dia)",
  "Um e-mail por dia com as outras vagas que batem, para se candidatar em 1 clique",
  "Site sem anúncios",
  "Seu perfil aparece primeiro para os recrutadores",
];
</script>

<template>
  <div v-if="me" class="mx-auto flex max-w-3xl flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <p class="text-sm text-muted-foreground">{{ me.email }}</p>
      </div>
      <Button variant="outline" size="sm" @click="logout">Sair da conta</Button>
    </div>

    <!-- Pro -->
    <Card class="gap-0 p-6 shadow-none" :class="me.pro ? 'border-primary/60' : ''">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold">IAPro Vagas Pro</h2>
        <Badge v-if="me.pro">Pro</Badge>
        <span v-if="statusText" class="text-sm text-muted-foreground">· {{ statusText }}</span>
      </div>
      <ul class="mt-3 flex flex-col gap-1.5 text-sm text-foreground/85">
        <li v-for="p in PERKS" :key="p" class="flex gap-2"><Check class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{{ p }}</li>
      </ul>
      <div v-if="!me.pro" class="mt-4 flex flex-col gap-3">
        <p class="text-sm"><b class="text-xl">R$ 5,00</b> por mês. Cancele quando quiser.</p>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" :disabled="billingBusy" @click="subscribe('card')">Assinar com cartão</Button>
          <Button :disabled="billingBusy" @click="subscribe('pix')"><Spinner v-if="billingBusy" />Assinar com Pix</Button>
        </div>
        <div v-if="pix" class="flex flex-col items-center gap-4 rounded-md border border-border p-4 sm:flex-row">
          <img :src="`data:image/png;base64,${pix.qrBase64}`" alt="QR Code do Pix" width="160" height="160" class="rounded-sm bg-foreground p-1" />
          <div class="flex flex-col items-start gap-2 text-sm">
            <p>Pague o Pix e o Pro libera sozinho em instantes (recarregue a página depois).</p>
            <Button size="sm" @click="copyPix">Copiar Pix copia e cola</Button>
          </div>
        </div>
        <p v-if="billingInfo" class="text-sm text-muted-foreground">{{ billingInfo }}</p>
      </div>
    </Card>

    <!-- Perfil -->
    <Card class="gap-0 p-6 shadow-none">
      <h2 class="text-base font-semibold">Seu perfil</h2>
      <p class="text-sm text-muted-foreground">É com ele que casamos as vagas e montamos o e-mail de candidatura.</p>
      <form class="mt-4 flex flex-col gap-4" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-2"><Label for="name">Nome (opcional)</Label><Input id="name" v-model="form.name" autocomplete="name" /></div>
          <div class="flex flex-col gap-2"><Label for="headline">Cargo que busca (opcional)</Label><Input id="headline" v-model="form.headline" placeholder="Dev Back-end" /></div>
          <div class="flex flex-col gap-2"><Label for="phone">Telefone (opcional)</Label><Input id="phone" v-model="form.phone" type="tel" autocomplete="tel" placeholder="(11) 91234-5678" /></div>
          <div class="flex flex-col gap-2"><Label for="linkedin">LinkedIn (opcional)</Label><Input id="linkedin" v-model="form.linkedin" placeholder="https://linkedin.com/in/seu-nome" /></div>
          <div class="flex flex-col gap-2"><Label for="company">Empresa atual (opcional)</Label><Input id="company" v-model="form.currentCompany" /></div>
          <div class="flex flex-col gap-2"><Label for="region">Estado ou país (opcional)</Label><Input id="region" v-model="form.region" placeholder="SP" /></div>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="stack">Tecnologias, separadas por vírgula (opcional)</Label>
          <Input id="stack" v-model="form.stack" placeholder="node, typescript, postgresql, aws" />
        </div>
        <div class="flex flex-col gap-2" role="group" aria-labelledby="seniority-label">
          <span id="seniority-label" class="text-sm font-medium">Senioridade (opcional)</span>
          <div class="flex flex-wrap gap-2">
            <Toggle v-for="s in SENIORITIES" :key="s" variant="outline" :class="pill" :model-value="form.seniority.includes(s)" @update:model-value="toggle(form.seniority, s)">{{ label(s) }}</Toggle>
          </div>
        </div>
        <div class="flex flex-col gap-2" role="group" aria-labelledby="workplace-label">
          <span id="workplace-label" class="text-sm font-medium">Modelo de trabalho (opcional)</span>
          <div class="flex flex-wrap gap-2">
            <Toggle v-for="w in WORKPLACES" :key="w" variant="outline" :class="pill" :model-value="form.workplace.includes(w)" @update:model-value="toggle(form.workplace, w)">{{ label(w) }}</Toggle>
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:w-1/2">
          <Label for="salary">Pretensão mínima mensal em R$ (opcional)</Label>
          <Input id="salary" v-model="form.salaryMin" inputmode="numeric" placeholder="8000" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="summary">Resumo (opcional)</Label>
          <Textarea id="summary" v-model="form.summary" rows="4" maxlength="2000" class="field-sizing-fixed resize-y" placeholder="O que você já fez, no que é bom, o que procura." />
        </div>

        <fieldset class="flex flex-col gap-3 rounded-md border border-border p-4">
          <legend class="px-1 text-sm font-medium">Autorizações</legend>
          <div class="flex items-start gap-2">
            <Checkbox id="c-alerts" v-model="form.consents.alerts" class="mt-0.5" />
            <Label for="c-alerts" class="block font-normal leading-snug">Quero receber por e-mail as vagas que batem com o meu perfil (Pro).</Label>
          </div>
          <div class="flex items-start gap-2">
            <Checkbox id="c-auto" v-model="form.consents.autoApply" class="mt-0.5" />
            <Label for="c-auto" class="block font-normal leading-snug">Autorizo o IAPro Vagas a enviar meu currículo, nome e contato, em meu nome, para o e-mail de candidatura das vagas que batem com o meu perfil (Pro, até 5 por dia).</Label>
          </div>
          <div class="flex items-start gap-2">
            <Checkbox id="c-bank" v-model="form.consents.talentBank" class="mt-0.5" />
            <Label for="c-bank" class="block font-normal leading-snug">Quero aparecer no banco de talentos para recrutadores verificados.</Label>
          </div>
          <RadioGroup v-if="form.consents.talentBank" v-model="form.visibility" class="gap-2 pl-6" aria-label="Como aparecer no banco de talentos">
            <div class="flex items-start gap-2">
              <RadioGroupItem id="v-anon" value="anonimo" class="mt-0.5" />
              <Label for="v-anon" class="block font-normal leading-snug"><b>Anônimo:</b> recrutador vê cargo, senioridade, tecnologias, estado e resumo. Nome e contato só se você aceitar o pedido.</Label>
            </div>
            <div class="flex items-start gap-2">
              <RadioGroupItem id="v-open" value="aberto" class="mt-0.5" />
              <Label for="v-open" class="block font-normal leading-snug"><b>Aberto:</b> igual ao anônimo, mais a empresa atual e o LinkedIn.</Label>
            </div>
          </RadioGroup>
        </fieldset>

        <div class="flex justify-end">
          <Button type="submit" :disabled="saving"><Spinner v-if="saving" />Salvar perfil</Button>
        </div>
      </form>
    </Card>

    <!-- Currículo -->
    <Card class="gap-0 p-6 shadow-none">
      <h2 class="text-base font-semibold">Currículo</h2>
      <p class="text-sm text-muted-foreground">PDF de até 3 MB. É ele que vai anexo no envio automático.</p>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <template v-if="myProfile?.cvFilename">
          <a href="/api/v1/me/cv" target="_blank" class="text-sm text-primary">{{ myProfile.cvFilename }}</a>
          <span class="text-xs text-muted-foreground" :title="date(myProfile.cvUpdatedAt!)">enviado {{ ago(myProfile.cvUpdatedAt!) }}</span>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button variant="ghost" size="sm">Remover</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover currículo?</AlertDialogTitle>
                <AlertDialogDescription>{{ myProfile.cvFilename }} será removido e o envio automático para até você mandar outro PDF. Essa ação não pode ser desfeita.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction :class="buttonVariants({ variant: 'destructive' })" @click="removeCv">Remover</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </template>
        <Button v-if="myProfile" as-child variant="outline" size="sm" :class="uploading && 'pointer-events-none opacity-50'">
          <label class="cursor-pointer">
            <input type="file" accept="application/pdf" class="sr-only" :disabled="uploading" @change="uploadCv" />
            <Spinner v-if="uploading" />{{ myProfile.cvFilename ? "Trocar PDF" : "Enviar PDF" }}
          </label>
        </Button>
        <span v-else class="text-sm text-muted-foreground">Salve o perfil primeiro.</span>
      </div>
      <p v-if="cvError" class="mt-2 text-sm text-destructive">{{ cvError }}</p>
    </Card>

    <!-- Envios -->
    <Card v-if="applications.length" class="gap-0 p-6 shadow-none">
      <h2 class="text-base font-semibold">Vagas que bateram com você</h2>
      <ul class="mt-3 divide-y divide-border">
        <li v-for="a in applications" :key="a.jobCode" class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
          <a :href="a.applyUrl" target="_blank" rel="noopener nofollow" class="min-w-0 font-medium text-foreground no-underline hover:text-primary">
            {{ a.jobTitle }}<span v-if="a.company" class="text-muted-foreground"> · {{ a.company }}</span>
          </a>
          <span class="text-xs text-muted-foreground">{{ channelText(a) }} · <span :title="date(a.createdAt)">{{ ago(a.createdAt) }}</span></span>
        </li>
      </ul>
    </Card>

    <!-- Recrutador -->
    <Card class="gap-0 p-6 shadow-none">
      <h2 class="text-base font-semibold">É recrutador?</h2>
      <p v-if="me?.recruiterStatus === 'aprovado'" class="mt-1 text-sm">
        Conta de recrutador da {{ me?.recruiterCompany }} aprovada. <RouterLink to="/recrutador" class="text-primary">Abrir o banco de talentos</RouterLink>
      </p>
      <p v-else-if="me?.recruiterStatus === 'pendente'" class="mt-1 text-sm text-muted-foreground">Pedido da {{ me?.recruiterCompany }} em análise. Avisamos por e-mail.</p>
      <template v-else>
        <p class="mt-1 text-sm text-muted-foreground">Peça acesso grátis ao banco de talentos. A gente confere e libera.</p>
        <form class="mt-4 flex flex-col gap-2" novalidate @submit.prevent="askRecruiter">
          <Label for="recruiter-company">Empresa</Label>
          <div class="flex flex-wrap gap-2">
            <Input id="recruiter-company" v-model="company" maxlength="120" class="min-w-[200px] flex-1" :aria-invalid="!!recruiterError || undefined" />
            <Button type="submit" variant="outline" :disabled="recruiterBusy"><Spinner v-if="recruiterBusy" />Pedir acesso</Button>
          </div>
          <p v-if="recruiterError" class="text-sm text-destructive">{{ recruiterError }}</p>
        </form>
        <p v-if="me?.recruiterStatus === 'recusado'" class="mt-2 text-sm text-muted-foreground">O pedido anterior foi recusado; você pode mandar de novo.</p>
      </template>
    </Card>

    <div class="flex justify-end pb-4">
      <AlertDialog>
        <AlertDialogTrigger as-child>
          <Button variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive">Excluir minha conta</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
            <AlertDialogDescription>A conta {{ me?.email }}, com o perfil, o currículo e o histórico de envios, será excluída. Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction :class="buttonVariants({ variant: 'destructive' })" @click="deleteAccount">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
  <div v-else class="mx-auto flex max-w-3xl flex-col gap-6" aria-busy="true">
    <Skeleton class="h-8 w-1/3" />
    <Skeleton class="h-48 rounded-xl" />
    <Skeleton class="h-96 rounded-xl" />
  </div>
</template>
