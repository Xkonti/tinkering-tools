export interface Tool {
  name: string;
  icon: string;
  description: string;
  routePath: string;
}

export interface ToolCategory {
  name: string;
  icon: string;
  tools: Tool[];
}

export const toolCategories: readonly ToolCategory[] = [
  {
    name: 'Electronics',
    icon: 'memory',
    tools: [
      {
        name: 'Voltage Divider',
        icon: 'electric_bolt',
        description:
          'Calculate the output voltage of a resistive voltage divider circuit given input voltage, R1, and R2.',
        routePath: '/electronics/voltage-divider',
      },
    ],
  },
];
