<template>
  <NSelect
    v-model:value="factor"
    :options="options"
    :consistent-menu-width="false"
    :disabled="!allowAdmin"
    size="small"
    style="width: auto; max-width: 9rem; flex-shrink: 0"
  />
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import { computed, watch } from "vue";
import { SelectOption } from "naive-ui";

import { type ConditionExpr, type Factor } from "@/plugins/cel";
import { useExprEditorContext } from "../context";
import { factorText } from "../../utils";
import { FactorList } from "../factor";

const props = defineProps<{
  expr: ConditionExpr;
}>();

const { allowAdmin, resourceType } = useExprEditorContext();

const factor = computed({
  get() {
    return props.expr.args[0];
  },
  set(factor) {
    props.expr.args[0] = factor;
  },
});

const factorList = computed((): Factor[] => {
  return FactorList[resourceType.value];
});

const options = computed(() => {
  return factorList.value.map<SelectOption>((v) => ({
    label: factorText(v),
    value: v,
  }));
});

watch(
  [factor, factorList],
  () => {
    if (factorList.value.length === 0) return;
    if (!factorList.value.includes(factor.value)) {
      factor.value = factorList.value[0];
    }
  },
  { immediate: true }
);
</script>
