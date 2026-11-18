<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ago, errorMessage, get, label, send, type Application, type Profile } from "@/api";
import { cn } from "@/lib/utils";
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
const saved = ref(false);
const formError = ref("");
const cvError = ref("");
const uploading = ref(false);
const applications = ref<Application[]>([]);
const company = ref("");
const recruiterError = ref("");
const pix = ref<{ copyPaste: string; qrBase64: string } | null>(null);
const pixCopied = ref(false);
const billingError = ref("");
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
const pill = (on: boolean) =>
  cn("rounded-full border-border px-3 font-normal text-muted-foreground shadow-none", on && "border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground");

async function save() {
  saving.value = true;
  saved.value = false;
  formError.value = "";
  try {
    const salary = Number(form.salaryMin.replace(/\D/g, ""));
    const r = await send<{ profile: Profile }>("PUT", "/api/v1/me/profile", {
      ...form,
      stack: form.stack.split(",").map((s) => s.trim()).filter(Boolean),
      salaryMin: salary > 0 ? salary : null,
    });
    myProfile.value = r.profile;
    saved.value = true;
    setTimeout(() => (saved.value = false), 2500);
  } catch (err) {
    formError.value = errorMessage(err);
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
  } catch (err) {
    cvError.value = errorMessage(err);
  } finally {
    uploading.value = false;
  }
}

async function removeCv() {
  myProfile.value = (await send<{ profile: Profile }>("DELETE", "/api/v1/me/cv")).profile;
}

async function subscribe(method: "pix" | "card") {
  billingBusy.value = true;
  billingError.value = "";
  try {
    const r = await send<{ initPoint?: string; charge?: { pix: { copyPaste: string; qrBase64: string } } | null; nextChargeAt?: string | null }>(
      "POST",
      "/api/v1/me/billing/checkout",
      { method },
    );
    if (r.initPoint) window.location.href = r.initPoint;
    else if (r.charge) pix.value = r.charge.pix;
    else if (r.nextChargeAt) billingError.value = `Seu Pix sai em ${new Date(r.nextChargeAt).toLocaleDateString("pt-BR")}. Avisamos por e-mail.`;
  } catch (err) {
    billingError.value = errorMessage(err);
  } finally {
    billingBusy.value = false;
  }
}

async function copyPix() {
  if (!pix.value) return;
  await navigator.clipboard.writeText(pix.value.copyPaste);
  pixCopied.value = true;
  setTimeout(() => (pixCopied.value = false), 2500);
}

async function askRecruiter() {
  recruiterError.value = "";
  try {
    await send("POST", "/api/v1/me/recruiter", { company: company.value });
    await loadMe();
  } catch (err) {
    recruiterError.value = errorMessage(err);
  }
}

async function logout() {
  await send("POST", "/api/v1/auth/logout");
  await loadMe();
  router.push("/");
}

async function deleteAccount() {
  if (!window.confirm("Apagar sua conta, perfil, currículo e histórico de envios? Não dá para desfazer.")) return;
  await send("DELETE", "/api/v1/me");
  await loadMe();
  router.push("/");
}

const statusText = computed(() => {
  const m = me.value;
  if (!m?.billingStatus) return null;
  const until = m.paidUntil ? new Date(m.paidUntil).toLocaleDateString("pt-BR") : null;
  return { trial: "Em teste", active: until ? `Ativo até ${until}` : "Ativo", past_due: "Pagamento pendente", canceled: "Cancelado" }[m.billingStatus];
});
const channelText = (a: Application) =>
  a.channel === "email" ? (a.status === "enviado" ? `CV enviado para ${a.toEmail}` : a.status === "falhou" ? "Falhou o envio" : "Na fila de envio") : a.status === "enviado" ? "Foi no alerta" : "Vai no próximo alerta";
const textarea =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
</script>

<template>
  <div v-if="me" class="mx-auto max-w-3xl space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Minha conta</h1>
        <p class="text-muted-foreground">{{ me.email }}</p>
      </div>
      <Button variant="outline" size="sm" @click="logout">Sair</Button>
    </div>

    <!-- Pro -->
    <Card class="p-5 shadow-none" :class="me.pro ? 'border-primary/60' : ''">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold">IAPro Vagas Pro</h2>
        <Badge v-if="me.pro">Pro</Badge>
        <span v-if="statusText" class="text-sm text-muted-foreground">· {{ statusText }}</span>
      </div>
      <ul class="mt-3 space-y-1 text-sm text-foreground/85">
        <li>✓ Envio automático do seu currículo para as vagas que batem com o seu perfil e têm e-mail de contato (até 5 por dia)</li>
        <li>✓ Um e-mail por dia com as outras vagas que batem, para se candidatar em 1 clique</li>
        <li>✓ Site sem anúncios</li>
        <li>✓ Seu perfil aparece primeiro para os recrutadores</li>
      </ul>
      <div v-if="!me.pro" class="mt-4 space-y-3">
        <p class="text-sm"><b class="text-xl">R$ 5</b> por mês. Cancele quando quiser.</p>
        <div class="flex flex-wrap gap-2">
          <Button :disabled="billingBusy" @click="subscribe('pix')">Assinar com Pix</Button>
          <Button variant="outline" :disabled="billingBusy" @click="subscribe('card')">Assinar com cartão</Button>
        </div>
        <div v-if="pix" class="flex flex-col items-center gap-3 rounded-md border border-border p-4 sm:flex-row">
          <img :src="`data:image/png;base64,${pix.qrBase64}`" alt="QR Code do Pix" width="160" height="160" class="rounded bg-white p-1" />
          <div class="space-y-2 text-sm">
            <p>Pague o Pix e o Pro libera sozinho em instantes (recarregue a página depois).</p>
            <Button size="sm" @click="copyPix">{{ pixCopied ? "Copiado ✓" : "Copiar Pix copia e cola" }}</Button>
          </div>
        </div>
        <p v-if="billingError" class="text-sm text-destructive">{{ billingError }}</p>
      </div>
    </Card>

    <!-- Perfil -->
    <Card class="p-5 shadow-none">
      <h2 class="text-lg font-semibold">Seu perfil</h2>
      <p class="text-sm text-muted-foreground">É com ele que casamos as vagas e montamos o e-mail de candidatura.</p>
      <form class="mt-4 space-y-4" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5"><Label for="name">Nome</Label><Input id="name" v-model="form.name" autocomplete="name" /></div>
          <div class="space-y-1.5"><Label for="headline">Cargo que busca</Label><Input id="headline" v-model="form.headline" placeholder="Dev Back-end" /></div>
          <div class="space-y-1.5"><Label for="phone">Telefone</Label><Input id="phone" v-model="form.phone" autocomplete="tel" /></div>
          <div class="space-y-1.5"><Label for="linkedin">LinkedIn</Label><Input id="linkedin" v-model="form.linkedin" placeholder="https://linkedin.com/in/..." /></div>
          <div class="space-y-1.5"><Label for="company">Empresa atual</Label><Input id="company" v-model="form.currentCompany" /></div>
          <div class="space-y-1.5"><Label for="region">Estado ou país</Label><Input id="region" v-model="form.region" placeholder="SP" /></div>
        </div>
        <div class="space-y-1.5">
          <Label for="stack">Tecnologias (separadas por vírgula)</Label>
          <Input id="stack" v-model="form.stack" placeholder="node, typescript, postgresql, aws" />
        </div>
        <div class="space-y-1.5">
          <span class="text-sm font-medium">Senioridade</span>
          <div class="flex flex-wrap gap-2">
            <Button v-for="s in SENIORITIES" :key="s" type="button" variant="outline" size="sm" :class="pill(form.seniority.includes(s))" @click="toggle(form.seniority, s)">{{ label(s) }}</Button>
          </div>
        </div>
        <div class="space-y-1.5">
          <span class="text-sm font-medium">Modelo de trabalho</span>
          <div class="flex flex-wrap gap-2">
            <Button v-for="w in WORKPLACES" :key="w" type="button" variant="outline" size="sm" :class="pill(form.workplace.includes(w))" @click="toggle(form.workplace, w)">{{ label(w) }}</Button>
          </div>
        </div>
        <div class="space-y-1.5 sm:w-1/2">
          <Label for="salary">Pretensão mínima mensal (R$, opcional)</Label>
          <Input id="salary" v-model="form.salaryMin" inputmode="numeric" placeholder="8000" />
        </div>
        <div class="space-y-1.5">
          <Label for="summary">Resumo</Label>
          <textarea id="summary" v-model="form.summary" rows="4" maxlength="2000" :class="textarea" placeholder="O que você já fez, no que é bom, o que procura." />
        </div>

        <fieldset class="space-y-3 rounded-md border border-border p-4">
          <legend class="px-1 text-sm font-medium">Autorizações</legend>
          <label class="flex items-start gap-2 text-sm">
            <input v-model="form.consents.alerts" type="checkbox" class="mt-0.5 accent-[hsl(var(--primary))]" />
            <span>Quero receber por e-mail as vagas que batem com o meu perfil (Pro).</span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input v-model="form.consents.autoApply" type="checkbox" class="mt-0.5 accent-[hsl(var(--primary))]" />
            <span>Autorizo o IAPro Vagas a enviar meu currículo, nome e contato, em meu nome, para o e-mail de candidatura das vagas que batem com o meu perfil (Pro, até 5 por dia).</span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input v-model="form.consents.talentBank" type="checkbox" class="mt-0.5 accent-[hsl(var(--primary))]" />
            <span>Quero aparecer no banco de talentos para recrutadores verificados.</span>
          </label>
          <div v-if="form.consents.talentBank" class="space-y-2 pl-6 text-sm">
            <label class="flex items-start gap-2">
              <input v-model="form.visibility" type="radio" value="anonimo" class="mt-0.5 accent-[hsl(var(--primary))]" />
              <span><b>Anônimo:</b> recrutador vê cargo, senioridade, tecnologias, estado e resumo. Nome e contato só se você aceitar o pedido.</span>
            </label>
            <label class="flex items-start gap-2">
              <input v-model="form.visibility" type="radio" value="aberto" class="mt-0.5 accent-[hsl(var(--primary))]" />
              <span><b>Aberto:</b> igual ao anônimo, mais a empresa atual e o LinkedIn.</span>
            </label>
          </div>
        </fieldset>

        <div class="flex items-center gap-3">
          <Button type="submit" :disabled="saving">{{ saving ? "Salvando..." : "Salvar perfil" }}</Button>
          <span v-if="saved" class="text-sm text-primary">Salvo ✓</span>
        </div>
        <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>
      </form>
    </Card>

    <!-- Currículo -->
    <Card class="p-5 shadow-none">
      <h2 class="text-lg font-semibold">Currículo</h2>
      <p class="text-sm text-muted-foreground">PDF de até 3 MB. É ele que vai anexo no envio automático.</p>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <template v-if="myProfile?.cvFilename">
          <a href="/api/v1/me/cv" target="_blank" class="text-sm text-primary">{{ myProfile.cvFilename }}</a>
          <span class="text-xs text-muted-foreground">enviado {{ ago(myProfile.cvUpdatedAt!) }}</span>
          <Button variant="ghost" size="sm" @click="removeCv">Remover</Button>
        </template>
        <label v-if="myProfile" class="cursor-pointer">
          <input type="file" accept="application/pdf" class="sr-only" @change="uploadCv" />
          <span class="inline-flex h-8 items-center rounded-md border border-input px-3 text-sm hover:bg-accent">{{ uploading ? "Enviando..." : myProfile.cvFilename ? "Trocar PDF" : "Enviar PDF" }}</span>
        </label>
        <span v-else class="text-sm text-muted-foreground">Salve o perfil primeiro.</span>
      </div>
      <p v-if="cvError" class="mt-2 text-sm text-destructive">{{ cvError }}</p>
    </Card>

    <!-- Envios -->
    <Card v-if="applications.length" class="p-5 shadow-none">
      <h2 class="text-lg font-semibold">Vagas que bateram com você</h2>
      <ul class="mt-3 divide-y divide-border">
        <li v-for="a in applications" :key="a.jobCode" class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
          <a :href="a.applyUrl" target="_blank" rel="noopener nofollow" class="min-w-0 font-medium text-foreground no-underline hover:text-primary">
            {{ a.jobTitle }}<span v-if="a.company" class="text-muted-foreground"> · {{ a.company }}</span>
          </a>
          <span class="text-xs text-muted-foreground">{{ channelText(a) }} · {{ ago(a.createdAt) }}</span>
        </li>
      </ul>
    </Card>

    <!-- Recrutador -->
    <Card class="p-5 shadow-none">
      <h2 class="text-lg font-semibold">É recrutador?</h2>
      <p v-if="me.recruiterStatus === 'aprovado'" class="mt-1 text-sm">
        Conta de recrutador da {{ me.recruiterCompany }} aprovada. <RouterLink to="/recrutador" class="text-primary">Abrir o banco de talentos</RouterLink>
      </p>
      <p v-else-if="me.recruiterStatus === 'pendente'" class="mt-1 text-sm text-muted-foreground">Pedido da {{ me.recruiterCompany }} em análise. Avisamos por e-mail.</p>
      <template v-else>
        <p class="mt-1 text-sm text-muted-foreground">Peça acesso grátis ao banco de talentos. A gente confere e libera.</p>
        <form class="mt-3 flex flex-wrap gap-2" @submit.prevent="askRecruiter">
          <Input v-model="company" required minlength="2" placeholder="Nome da empresa" class="min-w-[200px] flex-1" />
          <Button type="submit" variant="outline">Pedir acesso</Button>
        </form>
        <p v-if="me.recruiterStatus === 'recusado'" class="mt-2 text-sm text-muted-foreground">O pedido anterior foi recusado; você pode mandar de novo.</p>
        <p v-if="recruiterError" class="mt-2 text-sm text-destructive">{{ recruiterError }}</p>
      </template>
    </Card>

    <div class="pb-4 text-right">
      <button type="button" class="text-sm text-muted-foreground hover:text-destructive" @click="deleteAccount">Apagar minha conta</button>
    </div>
  </div>
  <p v-else class="text-muted-foreground">Carregando...</p>
</template>
