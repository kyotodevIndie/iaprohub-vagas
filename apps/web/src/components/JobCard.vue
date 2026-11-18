<script setup lang="ts">
import { computed } from "vue";
import { MapPin } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ago, label, type Job } from "@/api";

const props = defineProps<{ job: Job }>();

const place = computed(() => [props.job.workplace.map(label).join(" / "), props.job.location].filter(Boolean).join(" · "));
const summary = computed(() => (props.job.description ?? "").replace(/\s+/g, " ").trim());
</script>

<template>
  <RouterLink :to="`/vagas/${job.slug}`" class="group block min-w-0 no-underline">
    <Card class="flex h-full flex-col gap-2 p-5 shadow-none transition-colors duration-fast group-hover:border-input group-hover:bg-accent/40">
      <h2 class="break-words text-base font-semibold leading-snug">{{ job.title }}</h2>
      <p v-if="job.company" class="-mt-1 text-sm text-foreground/85">{{ job.company }}</p>
      <p v-if="place" class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin class="size-3.5 shrink-0" aria-hidden="true" />
        {{ place }}
      </p>
      <p v-if="summary" class="line-clamp-2 text-sm text-muted-foreground">{{ summary }}</p>
      <div v-if="job.seniority.length || job.regime.length || job.salary" class="flex flex-wrap gap-1.5">
        <Badge v-for="s in job.seniority" :key="s" variant="secondary" class="font-medium shadow-none">{{ label(s) }}</Badge>
        <Badge v-for="r in job.regime" :key="r" variant="secondary" class="font-medium shadow-none">{{ label(r) }}</Badge>
        <Badge v-if="job.salary" variant="outline" class="font-medium">{{ job.salary }}</Badge>
      </div>
      <div class="mt-auto flex items-center justify-between pt-1.5">
        <span class="text-sm font-semibold text-primary">Ver vaga →</span>
        <span class="text-xs text-muted-foreground">{{ ago(job.publishedAt) }}</span>
      </div>
    </Card>
  </RouterLink>
</template>
