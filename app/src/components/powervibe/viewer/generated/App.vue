<script setup lang="ts">
import { powervibeBundleApiUrl } from "@/components/powervibe/viewer/powervibeBundleApiUrl";
import { ref, reactive, onMounted } from "vue";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/vue";
import { Plus, Loader2 } from "lucide-vue-next";
interface Post { id: number; data: { title: string; content: string } }

const posts = ref<Post[]>([]);
const toasts = reactive<{ id: number; message: string }[]>([]);
const isOpen = ref(false);
const isLoading = ref(false);
const form = reactive({ title: "", content: "" });

async function fetchPosts() {
  const res = await fetch(powervibeBundleApiUrl("api/powervibe-app/posts"));
  const data = await res.json();
  posts.value = data.posts;
}

async function submitPost() {
  if (!form.title || !form.content) return;
  isLoading.value = true;
  
  await fetch(powervibeBundleApiUrl("api/powervibe-app/posts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form)
  });

  await fetchPosts();
  form.title = "";
  form.content = "";
  isOpen.value = false;
  isLoading.value = false;
  addToast("Post published successfully!");
}

function addToast(message: string) {
  const id = Date.now();
  toasts.push({ id, message });
  setTimeout(() => {
    const index = toasts.findIndex((t) => t.id === id);
    if (index > -1) toasts.splice(index, 1);
  }, 3000);
}

onMounted(fetchPosts);
</script>

<template>
  <div class="min-h-screen bg-neutral-50 p-8">
    <div class="mx-auto max-w-3xl">
      <header class="mb-10 flex items-center justify-between">
        <h1 class="text-3xl font-bold text-neutral-900">My PowerVibe Blog</h1>
        <button @click="isOpen = true" class="btn btn-primary flex items-center gap-2">
          <Plus class="h-4 w-4" /> New Post
        </button>
      </header>

      <div class="grid gap-6">
        <div v-for="post in posts" :key="post.id" class="card bg-white p-6 shadow-sm border border-neutral-200">
          <h2 class="text-xl font-semibold">{{ post.data.title }}</h2>
          <p class="mt-2 text-neutral-600">{{ post.data.content }}</p>
        </div>
      </div>
    </div>

    <div class="toast toast-end">
      <div v-for="t in toasts" :key="t.id" class="alert alert-success text-white">
        {{ t.message }}
      </div>
    </div>

    <Dialog :open="isOpen" @close="isOpen = false" class="relative z-50">
      <div class="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle class="text-lg font-bold">Write a Post</DialogTitle>
          <div class="mt-4 space-y-4">
            <input v-model="form.title" placeholder="Title" class="input input-bordered w-full" />
            <textarea v-model="form.content" placeholder="Content" class="textarea textarea-bordered w-full" />
            <button @click="submitPost" :disabled="isLoading" class="btn btn-primary w-full">
              <Loader2 v-if="isLoading" class="animate-spin" />
              {{ isLoading ? 'Publishing...' : 'Publish' }}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  </div>
</template>