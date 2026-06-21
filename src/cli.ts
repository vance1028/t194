#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import type { SimulationResult, SweepResult, SweepParams } from './types.js';
import { parseSceneFromFile, validateSceneFile, validateScene } from './scene.js';
import { simulate } from './simulator.js';
import { runSweep } from './sweep.js';
import { getSampleScenes } from './samples.js';

const program = new Command();

program
  .name('physim')
  .description('物理模拟器 - 计算投射物轨迹和碰撞')
  .version('1.0.0');

function formatOutput<T>(data: T, format: 'json' | 'csv', csvHeaders?: string[]): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  if (csvHeaders && Array.isArray(data)) {
    const header = csvHeaders.join(',');
    const rows = data.map((row: Record<string, unknown>) =>
      csvHeaders.map(h => {
        const val = row[h];
        if (typeof val === 'number') return val.toFixed(6);
        return String(val ?? '');
      }).join(',')
    );
    return [header, ...rows].join('\n');
  }

  return JSON.stringify(data, null, 2);
}

function trajectoryToCsv(result: SimulationResult): string {
  const header = 'time,x,y,vx,vy';
  const rows = result.trajectory.map(p =>
    `${p.time.toFixed(6)},${p.position.x.toFixed(6)},${p.position.y.toFixed(6)},${p.velocity.x.toFixed(6)},${p.velocity.y.toFixed(6)}`
  );
  return [header, ...rows].join('\n');
}

function sweepToCsv(result: SweepResult): string {
  const header = 'angleDegrees,initialSpeed,hitTime,hitSpeed,targetId';
  const rows = result.hits.map(h =>
    `${h.angleDegrees.toFixed(2)},${h.initialSpeed.toFixed(2)},${h.hitTime.toFixed(6)},${h.hitSpeed.toFixed(6)},${h.targetId}`
  );
  return [`totalCandidates,${result.totalCandidates}`, header, ...rows].join('\n');
}

interface SimulationSummary {
  hit: boolean;
  hitTargetId?: string;
  totalTime: number;
  trajectoryPoints: number;
  terminationReason: SimulationResult['terminationReason'];
  firstCollision?: SimulationResult['firstCollision'];
  finalPosition: SimulationResult['finalPosition'];
  finalVelocity: SimulationResult['finalVelocity'];
}

function getSimulationSummary(result: SimulationResult): SimulationSummary {
  return {
    hit: result.hit,
    hitTargetId: result.hitTargetId,
    totalTime: result.totalTime,
    trajectoryPoints: result.trajectory.length,
    terminationReason: result.terminationReason,
    firstCollision: result.firstCollision,
    finalPosition: result.finalPosition,
    finalVelocity: result.finalVelocity,
  };
}

function writeOutput(outputPath: string | undefined, content: string): void {
  if (outputPath) {
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`结果已写入: ${outputPath}`);
  } else {
    console.log(content);
  }
}

function printHumanSummary(result: SimulationResult): string {
  const lines: string[] = [];
  lines.push('=== 物理模拟结果摘要 ===');
  lines.push(`命中目标:     ${result.hit ? '是 ✓' : '否 ✗'}`);
  if (result.hitTargetId) {
    lines.push(`命中目标ID:   ${result.hitTargetId}`);
  }
  lines.push(`终止原因:     ${result.terminationReason}`);
  lines.push(`总模拟时间:   ${result.totalTime.toFixed(4)} s`);
  lines.push(`轨迹采样点:   ${result.trajectory.length}`);
  lines.push(`最终位置:     (${result.finalPosition.x.toFixed(4)}, ${result.finalPosition.y.toFixed(4)})`);
  const finalSpeed = Math.sqrt(
    result.finalVelocity.x * result.finalVelocity.x +
    result.finalVelocity.y * result.finalVelocity.y
  );
  lines.push(`最终速度:     (${result.finalVelocity.x.toFixed(4)}, ${result.finalVelocity.y.toFixed(4)})  大小: ${finalSpeed.toFixed(4)}`);

  if (result.firstCollision) {
    const fc = result.firstCollision;
    lines.push('');
    lines.push('--- 首次碰撞 ---');
    lines.push(`碰撞对象:     ${fc.obstacleId} (${fc.obstacleType})`);
    lines.push(`碰撞行为:     ${fc.action}`);
    lines.push(`碰撞时刻:     ${fc.time.toFixed(4)} s`);
    lines.push(`碰撞位置:     (${fc.position.x.toFixed(4)}, ${fc.position.y.toFixed(4)})`);
    lines.push(`碰撞后速度:   (${fc.velocity.x.toFixed(4)}, ${fc.velocity.y.toFixed(4)})  剩余速度: ${fc.remainingSpeed.toFixed(4)}`);
  }
  lines.push('========================');
  return lines.join('\n');
}

program
  .command('simulate')
  .description('运行单次物理模拟')
  .argument('<scene-file>', '场景配置 JSON 文件路径')
  .option('-f, --format <format>', '输出格式: json / csv / human (默认 human，仅摘要)', 'human')
  .option('-o, --output <file>', '输出文件路径')
  .option('--full', '输出完整结果（包含所有轨迹点），默认仅输出摘要')
  .option('--summary-only', '仅输出简洁摘要，等价于默认的 human 格式')
  .action((sceneFile, options) => {
    try {
      const scene = parseSceneFromFile(sceneFile);
      const result = simulate(scene);
      const format = options.format as 'json' | 'csv' | 'human';
      const outputFull = Boolean(options.full);
      const summaryOnly = Boolean(options.summaryOnly);

      let output: string;

      if (format === 'human') {
        output = printHumanSummary(result);
      } else if (format === 'csv') {
        output = trajectoryToCsv(result);
        const summary = getSimulationSummary(result);
        output = `# ${JSON.stringify(summary)}\n` + output;
      } else {
        if (outputFull && !summaryOnly) {
          output = formatOutput(result, 'json');
        } else {
          const summary = getSimulationSummary(result);
          output = formatOutput(summary, 'json');
        }
      }

      writeOutput(options.output, output);
    } catch (e) {
      console.error('模拟失败:', e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

program
  .command('sweep')
  .description('对角度和速度进行网格搜索，找出命中目标的参数')
  .argument('<scene-file>', '场景配置 JSON 文件路径')
  .option('--min-angle <degrees>', '最小角度 (度)', '0')
  .option('--max-angle <degrees>', '最大角度 (度)', '90')
  .option('--angle-step <degrees>', '角度步长', '5')
  .option('--min-speed <value>', '最小初速度', '5')
  .option('--max-speed <value>', '最大初速度', '50')
  .option('--speed-step <value>', '速度步长', '5')
  .option('--sort-by <criteria>', '排序方式: time 或 speed', 'time')
  .option('-f, --format <format>', '输出格式: json 或 csv', 'json')
  .option('-o, --output <file>', '输出文件路径')
  .action((sceneFile, options) => {
    try {
      const scene = parseSceneFromFile(sceneFile);

      const sweepParams: SweepParams = {
        angleRange: {
          min: parseFloat(options.minAngle),
          max: parseFloat(options.maxAngle),
          step: parseFloat(options.angleStep),
        },
        speedRange: {
          min: parseFloat(options.minSpeed),
          max: parseFloat(options.maxSpeed),
          step: parseFloat(options.speedStep),
        },
        sortBy: options.sortBy as 'time' | 'speed',
      };

      const result = runSweep(scene, sweepParams);
      const format = options.format as 'json' | 'csv';

      let output: string;
      if (format === 'csv') {
        output = sweepToCsv(result);
      } else {
        output = formatOutput(result, 'json');
      }

      writeOutput(options.output, output);
    } catch (e) {
      console.error('Sweep 失败:', e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

program
  .command('generate-sample')
  .description('生成示例场景配置文件')
  .argument('[output-dir]', '输出目录', './scenes')
  .option('--name <scene-name>', '只生成指定名称的场景')
  .action((outputDir, options) => {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const samples = getSampleScenes();
      const toGenerate = options.name
        ? samples.filter(s => s.name === options.name)
        : samples;

      if (toGenerate.length === 0) {
        console.error(`未找到场景: ${options.name}`);
        console.log('可用场景:', samples.map(s => s.name).join(', '));
        process.exit(1);
      }

      for (const sample of toGenerate) {
        const validation = validateScene(sample.scene);
        if (!validation.valid) {
          console.error(`场景 ${sample.name} 验证失败:`, validation.errors);
          process.exit(1);
        }

        const filePath = path.join(outputDir, sample.filename);
        const content = JSON.stringify(sample.scene, null, 2);
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`已生成: ${filePath}`);
        console.log(`  ${sample.description}`);
      }
    } catch (e) {
      console.error('生成示例失败:', e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

program
  .command('check')
  .description('验证场景配置的合法性')
  .argument('<scene-file>', '场景配置 JSON 文件路径')
  .action((sceneFile) => {
    const result = validateSceneFile(sceneFile);

    if (result.valid) {
      console.log('✓ 场景配置有效');
      process.exit(0);
    } else {
      console.error('✗ 场景配置无效:');
      for (const error of result.errors) {
        console.error(`  - ${error.field}: ${error.message}`);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
