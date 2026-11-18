import { ref } from "vue";
import { get, type Me, type Profile } from "@/api";

// Conta de quem está no site. null = sem login; undefined = ainda carregando.
export const me = ref<Me | null | undefined>(undefined);
export const myProfile = ref<Profile | null>(null);

export async function loadMe() {
  try {
    const r = await get<{ user: Me; profile: Profile | null }>("/api/v1/me");
    me.value = r.user;
    myProfile.value = r.profile;
  } catch {
    me.value = null;
    myProfile.value = null;
  }
}
