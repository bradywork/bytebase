<template>
  <div class="flex items-center gap-x-2">
    <NButton type="primary" :disabled="!allowAdmin" @click="createNode">
      {{ $t("common.create") }}
    </NButton>
  </div>
</template>

<script lang="ts" setup>
import { NButton } from "naive-ui";
import { v4 as uuidv4 } from "uuid";

import { useCustomApprovalContext } from "../context";
import { ExternalApprovalSetting_Node } from "@/types/proto/v1/setting_service";
const context = useCustomApprovalContext();
const { allowAdmin, externalApprovalNodeContext } = context;

const createNode = () => {
  externalApprovalNodeContext.value = {
    mode: "CREATE",
    node: ExternalApprovalSetting_Node.fromJSON({
      id: uuidv4(),
    }),
  };
};
</script>
