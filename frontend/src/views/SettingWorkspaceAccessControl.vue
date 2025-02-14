<template>
  <div class="w-full mt-4 space-y-4">
    <FeatureAttention
      v-if="!hasDataAccessControlFeature"
      feature="bb.feature.access-control"
    />
    <div class="flex justify-between">
      <i18n-t
        tag="div"
        keypath="settings.access-control.description"
        class="textinfolabel"
      >
        <template #link>
          <LearnMoreLink
            url="https://www.bytebase.com/docs/security/data-access-control"
          />
        </template>
      </i18n-t>
    </div>

    <div class="relative">
      <BBTable
        :column-list="COLUMN_LIST"
        :data-source="state.environmentPolicyList"
        :show-header="true"
        :left-bordered="true"
        :right-bordered="true"
        :row-clickable="false"
      >
        <template #body="{ rowData: policy }: { rowData: EnvironmentPolicy }">
          <BBTableCell>
            <EnvironmentV1Name
              class="pl-2"
              :environment="policy.environment"
              :link="false"
            />
          </BBTableCell>
          <BBTableCell>
            <NCheckbox
              v-model:checked="policy.allowQueryData"
              :disabled="!allowAdmin"
            >
              {{ $t("settings.access-control.skip-approval") }}
            </NCheckbox>
          </BBTableCell>
          <BBTableCell>
            <NCheckbox
              v-model:checked="policy.allowExportData"
              :disabled="!allowAdmin"
            >
              {{ $t("settings.access-control.skip-approval") }}
            </NCheckbox>
          </BBTableCell>
        </template>
      </BBTable>

      <div
        v-if="state.isLoading"
        class="absolute w-full h-full inset-0 z-1 bg-white/50 flex flex-col items-center justify-center"
      >
        <BBSpin />
      </div>

      <div
        v-if="!hasDataAccessControlFeature"
        class="absolute w-full h-full inset-0 z-10 bg-gray-300/80 flex flex-col items-center justify-center"
      >
        <button
          type="button"
          class="btn-primary whitespace-nowrap shadow"
          @click.prevent="handleUpgradeSubscription"
        >
          <heroicons-solid:sparkles class="text-white w-5 h-auto mr-1" />
          {{ $t("subscription.upgrade") }}
        </button>
      </div>
    </div>
  </div>

  <FeatureModal
    v-if="state.showFeatureModal"
    feature="bb.feature.access-control"
    @cancel="state.showFeatureModal = false"
  />
</template>

<script lang="ts" setup>
import { NCheckbox } from "naive-ui";
import { computed, reactive, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";

import { featureToRef, useCurrentUserV1, useEnvironmentV1List } from "@/store";
import { BBTableColumn } from "@/bbkit/types";
import { hasWorkspacePermissionV1 } from "@/utils";
import { usePolicyV1Store } from "@/store/modules/v1/policy";
import { Environment } from "@/types/proto/v1/environment_service";
import { EnvironmentV1Name } from "@/components/v2";
import { resolveCELExpr } from "@/plugins/cel";
import {
  PolicyResourceType,
  PolicyType,
} from "@/types/proto/v1/org_policy_service";
import { IamPolicy } from "@/types/proto/v1/iam_policy";
import { Expr } from "@/types/proto/google/type/expr";
import { useDebounceFn } from "@vueuse/core";
import { useRouter } from "vue-router";

interface EnvironmentPolicy {
  environment: Environment;
  allowQueryData: boolean;
  allowExportData: boolean;
}

interface LocalState {
  showFeatureModal: boolean;
  isLoading: boolean;
  environmentPolicyList: EnvironmentPolicy[];
}

const { t } = useI18n();
const router = useRouter();
const environmentList = useEnvironmentV1List();
const policyStore = usePolicyV1Store();
const currentUserV1 = useCurrentUserV1();
const hasDataAccessControlFeature = featureToRef("bb.feature.access-control");
const state = reactive<LocalState>({
  showFeatureModal: false,
  isLoading: true,
  environmentPolicyList: environmentList.value.map((environment) => {
    const defaultValue = hasDataAccessControlFeature.value ? false : true;
    return {
      environment,
      allowQueryData: defaultValue,
      allowExportData: defaultValue,
    };
  }),
});

const allowAdmin = computed(() => {
  return hasWorkspacePermissionV1(
    "bb.permission.workspace.manage-access-control",
    currentUserV1.value.userRole
  );
});

const COLUMN_LIST = computed((): BBTableColumn[] => [
  {
    title: t("common.environment"),
  },
  {
    title: t("settings.access-control.query-data"),
  },
  {
    title: t("settings.access-control.export-data"),
  },
]);

onMounted(async () => {
  const policy = await policyStore.getOrFetchPolicyByName(
    "policies/WORKSPACE_IAM"
  );
  if (!policy || !policy.workspaceIamPolicy) {
    state.isLoading = false;
    return;
  }

  for (const binding of policy.workspaceIamPolicy.bindings) {
    if (!binding.members.includes("allUsers")) {
      continue;
    }

    if (binding.parsedExpr?.expr) {
      const simpleExpr = resolveCELExpr(binding.parsedExpr.expr);
      const args = simpleExpr.args;
      if (
        simpleExpr.operator !== "@in" ||
        args[0] !== "resource.environment_name"
      ) {
        continue;
      }

      const environmentNameList = args[1] as string[];
      for (const environmentPolicy of state.environmentPolicyList) {
        if (environmentNameList.includes(environmentPolicy.environment.name)) {
          if (binding.role === "roles/QUERIER") {
            environmentPolicy.allowQueryData = true;
          } else if (binding.role === "roles/EXPORTER") {
            environmentPolicy.allowExportData = true;
          }
        }
      }
    }
  }
  state.isLoading = false;
});

const handleUpgradeSubscription = () => {
  router.push({ name: "setting.workspace.subscription" });
};

const buildWorkspaceIAMPolicy = (envPolicyList: EnvironmentPolicy[]) => {
  const workspaceIamPolicy: IamPolicy = IamPolicy.fromPartial({});

  const allowQueryEnvNameList: string[] = envPolicyList
    .filter((item) => item.allowQueryData)
    .map((item) => item.environment.name);
  const allowExportEnvNameList: string[] = envPolicyList
    .filter((item) => item.allowExportData)
    .map((item) => item.environment.name);
  if (allowQueryEnvNameList.length > 0) {
    workspaceIamPolicy.bindings.push({
      role: "roles/QUERIER",
      members: ["allUsers"],
      condition: Expr.fromPartial({
        expression: `resource.environment_name in ["${allowQueryEnvNameList.join(
          '", "'
        )}"]`,
      }),
    });
  }
  if (allowExportEnvNameList.length > 0) {
    workspaceIamPolicy.bindings.push({
      role: "roles/EXPORTER",
      members: ["allUsers"],
      condition: Expr.fromPartial({
        expression: `resource.environment_name in ["${allowExportEnvNameList.join(
          '", "'
        )}"]`,
      }),
    });
  }
  return workspaceIamPolicy;
};

const upsertWorkspaceIAMPolicy = useDebounceFn(async () => {
  if (!hasDataAccessControlFeature.value) {
    state.showFeatureModal = true;
    return;
  }

  if (!allowAdmin.value) {
    return;
  }

  await policyStore.createPolicy("", {
    type: PolicyType.WORKSPACE_IAM,
    resourceType: PolicyResourceType.WORKSPACE,
    resourceUid: "1",
    workspaceIamPolicy: buildWorkspaceIAMPolicy(state.environmentPolicyList),
  });
}, 200);

watch(
  () => state.environmentPolicyList,
  async () => {
    await upsertWorkspaceIAMPolicy();
  },
  {
    deep: true,
  }
);
</script>
