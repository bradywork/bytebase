<template>
  <BBTable
    :column-list="columnNameList"
    :data-source="columnList"
    :show-header="true"
    :left-bordered="true"
    :right-bordered="true"
    v-bind="$attrs"
  >
    <template #body="{ rowData: column }">
      <BBTableCell
        v-if="showSensitiveColumn"
        :left-padding="4"
        class="w-[1%] text-center"
      >
        <!-- width: 1% means as narrow as possible -->
        <div class="flex items-center justify-center">
          <FeatureBadge
            feature="bb.feature.sensitive-data"
            custom-class="mr-2"
            :instance="database.instanceEntity"
          />
          <input
            type="checkbox"
            class="h-4 w-4 text-accent rounded disabled:cursor-not-allowed border-control-border focus:ring-accent"
            :disabled="!allowAdmin || instanceMissingLicense"
            :checked="isSensitiveColumn(column)"
            @input="
              toggleSensitiveColumn(
                column,
                ($event.target as HTMLInputElement).checked,
                $event
              )
            "
          />
        </div>
      </BBTableCell>
      <BBTableCell class="w-16" :left-padding="showSensitiveColumn ? 2 : 4">
        {{ column.name }}
      </BBTableCell>
      <BBTableCell class="w-8">
        {{ column.type }}
      </BBTableCell>
      <BBTableCell class="w-8">
        {{ column.default }}
      </BBTableCell>
      <BBTableCell class="w-8">
        {{ column.nullable }}
      </BBTableCell>
      <BBTableCell
        v-if="
          engine !== Engine.POSTGRES &&
          engine !== Engine.CLICKHOUSE &&
          engine !== Engine.SNOWFLAKE
        "
        class="w-8"
      >
        {{ column.characterSet }}
      </BBTableCell>
      <BBTableCell
        v-if="engine !== Engine.CLICKHOUSE && engine !== Engine.SNOWFLAKE"
        class="w-8"
      >
        {{ column.collation }}
      </BBTableCell>
      <BBTableCell class="w-16">
        {{ column.comment }}
      </BBTableCell>
    </template>
  </BBTable>

  <FeatureModal
    v-if="state.showFeatureModal"
    feature="bb.feature.sensitive-data"
    :instance="database.instanceEntity"
    @cancel="state.showFeatureModal = false"
  />
</template>

<script lang="ts" setup>
import { cloneDeep } from "lodash-es";
import { computed, PropType, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { Column, ComposedDatabase } from "@/types";
import { ColumnMetadata, TableMetadata } from "@/types/proto/store/database";
import { useCurrentUserV1, useSubscriptionV1Store } from "@/store";
import { hasWorkspacePermissionV1 } from "@/utils";
import { BBTableColumn } from "@/bbkit/types";
import { usePolicyV1Store } from "@/store/modules/v1/policy";
import {
  PolicyType,
  SensitiveData,
  SensitiveDataMaskType,
} from "@/types/proto/v1/org_policy_service";
import { Engine } from "@/types/proto/v1/common";

type LocalState = {
  showFeatureModal: boolean;
};

const props = defineProps({
  database: {
    required: true,
    type: Object as PropType<ComposedDatabase>,
  },
  schema: {
    required: true,
    type: String,
  },
  table: {
    required: true,
    type: Object as PropType<TableMetadata>,
  },
  columnList: {
    required: true,
    type: Object as PropType<ColumnMetadata[]>,
  },
  sensitiveDataList: {
    required: true,
    type: Array as PropType<SensitiveData[]>,
  },
});

const { t } = useI18n();
const state = reactive<LocalState>({
  showFeatureModal: false,
});
const engine = computed(() => {
  return props.database.instanceEntity.engine;
});
const subscriptionV1Store = useSubscriptionV1Store();

const instanceMissingLicense = computed(() => {
  return subscriptionV1Store.instanceMissingLicense(
    "bb.feature.sensitive-data",
    props.database.instanceEntity
  );
});
const hasSensitiveDataFeature = computed(() => {
  return subscriptionV1Store.hasFeature("bb.feature.sensitive-data");
});

const showSensitiveColumn = computed(() => {
  return (
    hasSensitiveDataFeature.value &&
    (engine.value === Engine.MYSQL ||
      engine.value === Engine.TIDB ||
      engine.value === Engine.POSTGRES ||
      engine.value === Engine.REDSHIFT ||
      engine.value === Engine.ORACLE)
  );
});

const currentUserV1 = useCurrentUserV1();
const allowAdmin = computed(() => {
  if (
    hasWorkspacePermissionV1(
      "bb.permission.workspace.manage-sensitive-data",
      currentUserV1.value.userRole
    )
  ) {
    // True if the currentUser has workspace level sensitive data
    // R+W privileges. AKA DBA or Workspace owner
    return true;
  }

  // False otherwise
  return false;
});

const NORMAL_COLUMN_LIST = computed(() => {
  const columnList: BBTableColumn[] = [
    {
      title: t("common.name"),
    },
    {
      title: t("common.type"),
    },
    {
      title: t("common.Default"),
    },
    {
      title: t("database.nullable"),
    },
    {
      title: t("db.character-set"),
    },
    {
      title: t("db.collation"),
    },
    {
      title: t("database.comment"),
    },
  ];
  if (showSensitiveColumn.value) {
    columnList.unshift({
      title: t("database.sensitive"),
      center: true,
      nowrap: true,
    });
  }
  return columnList;
});
const POSTGRES_COLUMN_LIST = computed(() => {
  const columnList: BBTableColumn[] = [
    {
      title: t("common.name"),
    },
    {
      title: t("common.type"),
    },
    {
      title: t("common.Default"),
    },
    {
      title: t("database.nullable"),
    },
    {
      title: t("db.collation"),
    },
    {
      title: t("database.comment"),
    },
  ];
  if (showSensitiveColumn.value) {
    columnList.unshift({
      title: t("database.sensitive"),
      center: true,
      nowrap: true,
    });
  }
  return columnList;
});
const CLICKHOUSE_SNOWFLAKE_COLUMN_LIST = computed((): BBTableColumn[] => [
  {
    title: t("common.name"),
  },
  {
    title: t("common.type"),
  },
  {
    title: t("common.Default"),
  },
  {
    title: t("database.nullable"),
  },
  {
    title: t("database.comment"),
  },
]);

const columnNameList = computed(() => {
  switch (engine.value) {
    case Engine.POSTGRES:
      return POSTGRES_COLUMN_LIST.value;
    case Engine.CLICKHOUSE:
    case Engine.SNOWFLAKE:
      return CLICKHOUSE_SNOWFLAKE_COLUMN_LIST.value;
    default:
      return NORMAL_COLUMN_LIST.value;
  }
});

const isSensitiveColumn = (column: Column) => {
  return (
    props.sensitiveDataList.findIndex((sensitiveData) => {
      return (
        sensitiveData.table === props.table.name &&
        sensitiveData.column === column.name
      );
    }) >= 0
  );
};

const toggleSensitiveColumn = (column: Column, on: boolean, e: Event) => {
  if (!hasSensitiveDataFeature.value || instanceMissingLicense.value) {
    state.showFeatureModal = true;

    // Revert UI states
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLInputElement).checked = !on;
    return;
  }

  const index = props.sensitiveDataList.findIndex((sensitiveData) => {
    return (
      sensitiveData.table === props.table.name &&
      sensitiveData.column === column.name
    );
  });
  const sensitiveDataList = cloneDeep(props.sensitiveDataList);
  if (on && index < 0) {
    // Turn on sensitive
    sensitiveDataList.push({
      schema: props.schema,
      table: props.table.name,
      column: column.name,
      maskType: SensitiveDataMaskType.DEFAULT,
    });
  } else if (!on && index >= 0) {
    sensitiveDataList.splice(index, 1);
  }

  usePolicyV1Store().upsertPolicy({
    parentPath: props.database.name,
    policy: {
      type: PolicyType.SENSITIVE_DATA,
      sensitiveDataPolicy: {
        sensitiveData: sensitiveDataList,
      },
    },
    updateMask: ["payload"],
  });
};
</script>
