<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-6">
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">Calculator</div>

            <q-input
              v-model.number="vin"
              type="number"
              outlined
              label="Input Voltage (Vin)"
              suffix="V"
              class="q-mb-md"
            />

            <q-input
              v-model.number="r1"
              type="number"
              outlined
              label="Resistor R1"
              suffix="Ω"
              class="q-mb-md"
            />

            <q-input
              v-model.number="r2"
              type="number"
              outlined
              label="Resistor R2"
              suffix="Ω"
              class="q-mb-md"
            />

            <q-separator />

            <div class="q-mt-md">
              <div class="text-subtitle2 text-grey-7">Output Voltage (Vout)</div>
              <div v-if="vout !== null" class="text-h4 text-primary">
                {{ vout.toFixed(4) }} V
              </div>
              <div v-else class="text-body1 text-grey-5">
                Enter all values to see the result
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-md-6">
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">About Voltage Dividers</div>

            <p>
              A voltage divider is a simple circuit that produces an output
              voltage that is a fraction of the input voltage. It consists of two
              resistors connected in series across a voltage source.
            </p>

            <p class="text-weight-bold">Formula:</p>
            <p class="text-h6 text-center q-my-md">
              Vout = Vin &times; R2 / (R1 + R2)
            </p>

            <p class="text-weight-bold">Common uses:</p>
            <ul>
              <li>Reading sensor voltages with microcontrollers</li>
              <li>Setting reference voltages</li>
              <li>Level shifting between different voltage domains</li>
              <li>Biasing active components</li>
            </ul>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const vin = ref<number | null>(null);
const r1 = ref<number | null>(null);
const r2 = ref<number | null>(null);

const vout = computed(() => {
  const v = vin.value;
  const resistance1 = r1.value;
  const resistance2 = r2.value;

  if (v === null || resistance1 === null || resistance2 === null) return null;
  if (!Number.isFinite(v) || !Number.isFinite(resistance1) || !Number.isFinite(resistance2)) {
    return null;
  }

  const total = resistance1 + resistance2;
  if (total <= 0) return null;

  return v * (resistance2 / total);
});
</script>
