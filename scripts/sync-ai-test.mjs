#!/usr/bin/env node

/**
 * ai_test 디렉토리 동기화 스크립트
 * 메인 프로젝트와 ai_test 디렉토리를 심볼릭 링크로 동기화합니다.
 * 
 * 사용법:
 *   node scripts/sync-ai-test.mjs [옵션]
 * 
 * 옵션:
 *   --clean     : ai_test 디렉토리를 완전히 정리하고 새로 생성
 *   --dry-run   : 실제 변경 없이 실행 계획만 출력
 *   --help      : 도움말 출력
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync, copyFileSync, readlinkSync, lstatSync } from 'fs';
import { join, relative, resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// 공유할 파일 및 디렉토리 목록
const SHARED_ITEMS = [
  'src',
  'public',
  'package.json',
  'vite.config.js',
  'tailwind.config.js',
  'postcss.config.js',
  'eslint.config.js',
  'capacitor.config.json',
  'index.html',
  'README.md',
  'supabase.env.example',
  '.gitignore',
  '.vercelignore'
];

// ai_test 전용으로 유지할 항목
const AI_TEST_EXCLUSIVE = [
  'android',
  'api',
  'database',
  'server',
  'tmp_frames',
  'dist'
];

// Windows에서 심볼릭 링크 생성 함수
function createSymlinkWindows(source, target) {
  try {
    // 관리자 권한이 필요한 경우 mklink 사용
    const isDirectory = statSync(source).isDirectory();
    const cmd = isDirectory 
      ? `mklink /D "${target}" "${source}"`
      : `mklink "${target}" "${source}"`;
    
    execSync(cmd, { stdio: 'inherit', shell: true });
    console.log(`✓ 심볼릭 링크 생성: ${relative(projectRoot, target)} -> ${relative(projectRoot, source)}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Windows 심볼릭 링크 생성 실패 (관리자 권한 필요): ${error.message}`);
    console.log(`📋 대안: 파일 복사 실행`);
    
    // 대안: 파일 복사
    if (statSync(source).isDirectory()) {
      execSync(`xcopy /E /I /Y "${source}" "${target}"`, { stdio: 'inherit', shell: true });
    } else {
      copyFileSync(source, target);
    }
    console.log(`✓ 파일 복사 완료: ${relative(projectRoot, target)}`);
    return false;
  }
}

// Unix에서 심볼릭 링크 생성 함수
function createSymlinkUnix(source, target) {
  try {
    const isDirectory = statSync(source).isDirectory();
    const sourcePath = relative(dirname(target), source);
    
    execSync(`ln -sf "${sourcePath}" "${target}"`, { stdio: 'inherit' });
    console.log(`✓ 심볼릭 링크 생성: ${relative(projectRoot, target)} -> ${relative(projectRoot, source)}`);
    return true;
  } catch (error) {
    console.error(`❌ 심볼릭 링크 생성 실패: ${error.message}`);
    return false;
  }
}

// 심볼릭 링크 생성
function createSymlink(source, target) {
  const sourcePath = resolve(projectRoot, source);
  const targetPath = resolve(projectRoot, 'ai_test', target);
  
  // 소스 파일 확인
  if (!existsSync(sourcePath)) {
    console.warn(`⚠️ 소스 파일 없음: ${source}`);
    return false;
  }
  
  // 대상 디렉토리 생성
  const targetDir = dirname(targetPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  
  // 기존 링크/파일 제거
  if (existsSync(targetPath)) {
    try {
      const stats = lstatSync(targetPath);
      if (stats.isSymbolicLink()) {
        unlinkSync(targetPath);
      } else if (stats.isDirectory()) {
        rmdirSync(targetPath, { recursive: true });
      } else {
        unlinkSync(targetPath);
      }
    } catch (error) {
      console.warn(`⚠️ 기존 파일 제거 실패: ${error.message}`);
    }
  }
  
  // 플랫폼별 심볼릭 링크 생성
  if (process.platform === 'win32') {
    return createSymlinkWindows(sourcePath, targetPath);
  } else {
    return createSymlinkUnix(sourcePath, targetPath);
  }
}

// ai_test 디렉토리 정리
function cleanAiTestDirectory(dryRun = false) {
  const aiTestPath = join(projectRoot, 'ai_test');
  
  if (!existsSync(aiTestPath)) {
    console.log('📁 ai_test 디렉토리가 없습니다. 새로 생성합니다.');
    if (!dryRun) {
      mkdirSync(aiTestPath, { recursive: true });
    }
    return;
  }
  
  console.log('🧹 ai_test 디렉토리 정리 중...');
  
  const items = readdirSync(aiTestPath);
  for (const item of items) {
    const itemPath = join(aiTestPath, item);
    
    // ai_test 전용 항목은 유지
    if (AI_TEST_EXCLUSIVE.includes(item)) {
      console.log(`🔒 유지: ${item}`);
      continue;
    }
    
    // 심볼릭 링크인 경우
    try {
      const stats = lstatSync(itemPath);
      if (stats.isSymbolicLink()) {
        console.log(`🔗 제거 (심볼릭 링크): ${item}`);
        if (!dryRun) {
          unlinkSync(itemPath);
        }
      } else if (stats.isDirectory()) {
        console.log(`🗑️ 제거 (디렉토리): ${item}`);
        if (!dryRun) {
          rmdirSync(itemPath, { recursive: true });
        }
      } else {
        console.log(`🗑️ 제거 (파일): ${item}`);
        if (!dryRun) {
          unlinkSync(itemPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️ ${item} 처리 중 오류: ${error.message}`);
    }
  }
  
  console.log('✅ ai_test 디렉토리 정리 완료');
}

// 심볼릭 링크 생성
function createSymlinks(dryRun = false) {
  console.log('🔗 심볼릭 링크 생성 중...');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const item of SHARED_ITEMS) {
    const sourcePath = join(projectRoot, item);
    
    if (!existsSync(sourcePath)) {
      console.warn(`⚠️ 소스 없음: ${item}`);
      failCount++;
      continue;
    }
    
    if (dryRun) {
      console.log(`📋 예정: ${item} -> ai_test/${item}`);
      successCount++;
      continue;
    }
    
    if (createSymlink(item, item)) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log(`📊 결과: ${successCount}개 성공, ${failCount}개 실패`);
  return { successCount, failCount };
}

// ai_test 전용 항목 확인
function checkAiTestExclusiveItems() {
  console.log('🔍 ai_test 전용 항목 확인 중...');
  
  const aiTestPath = join(projectRoot, 'ai_test');
  let missingItems = [];
  
  for (const item of AI_TEST_EXCLUSIVE) {
    const itemPath = join(aiTestPath, item);
    if (!existsSync(itemPath)) {
      missingItems.push(item);
    }
  }
  
  if (missingItems.length > 0) {
    console.log(`⚠️ ai_test 전용 항목이 없습니다: ${missingItems.join(', ')}`);
    console.log('💡 메인 프로젝트에서 복사하거나 수동으로 생성해주세요.');
  } else {
    console.log('✅ 모든 ai_test 전용 항목이 존재합니다.');
  }
  
  return missingItems;
}

// package.json 수정 (ai_test 전용)
function updateAiTestPackageJson() {
  const aiTestPackagePath = join(projectRoot, 'ai_test', 'package.json');
  
  if (!existsSync(aiTestPackagePath)) {
    console.warn('⚠️ ai_test/package.json이 없습니다.');
    return false;
  }
  
  try {
    const packageJson = JSON.parse(execSync(`cat "${aiTestPackagePath}"`, { encoding: 'utf8' }));
    
    // ai_test 전용 스크립트 추가
    packageJson.scripts = {
      ...packageJson.scripts,
      'dev:ai': 'vite --config ./vite.config.js',
      'build:ai': 'vite build --config ./vite.config.js',
      'preview:ai': 'vite preview --config ./vite.config.js',
      'android:ai': 'cd android && ./gradlew assembleDebug',
      'ios:ai': 'echo "iOS 빌드는 별도 설정이 필요합니다."'
    };
    
    // ai_test 전용 설명 추가
    packageJson.description = `${packageJson.description || '시험공부AI'} - ai_test 빌드`;
    packageJson.name = `${packageJson.name}-ai-test`;
    
    execSync(`echo '${JSON.stringify(packageJson, null, 2)}' > "${aiTestPackagePath}"`, { shell: true });
    console.log('✅ ai_test/package.json 업데이트 완료');
    return true;
  } catch (error) {
    console.error(`❌ package.json 업데이트 실패: ${error.message}`);
    return false;
  }
}

// 메인 함수
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cleanMode = args.includes('--clean');
  const helpMode = args.includes('--help');
  
  if (helpMode) {
    console.log(`
시험공부AI - ai_test 디렉토리 동기화 스크립트

사용법:
  node scripts/sync-ai-test.mjs [옵션]

옵션:
  --clean     : ai_test 디렉토리를 완전히 정리하고 새로 생성
  --dry-run   : 실제 변경 없이 실행 계획만 출력
  --help      : 이 도움말 출력

기능:
  1. 메인 프로젝트와 ai_test 디렉토리를 심볼릭 링크로 동기화
  2. ai_test 전용 항목 유지 (android, api, database 등)
  3. Windows/Unix 플랫폼 자동 감지
  4. package.json 자동 업데이트

주의사항:
  - Windows에서는 관리자 권한이 필요할 수 있습니다
  - 관리자 권한 없이 실행 시 파일 복사로 대체됩니다
    `);
    return;
  }
  
  console.log('🚀 시험공부AI - ai_test 디렉토리 동기화 시작');
  console.log(`📁 프로젝트 루트: ${projectRoot}`);
  console.log(`💻 플랫폼: ${process.platform}`);
  console.log(`🔍 모드: ${dryRun ? '드라이런 (변경 없음)' : cleanMode ? '클린 모드' : '일반 모드'}`);
  console.log('─'.repeat(50));
  
  try {
    // 1. ai_test 디렉토리 정리 (클린 모드 또는 처음 실행 시)
    if (cleanMode || !existsSync(join(projectRoot, 'ai_test'))) {
      cleanAiTestDirectory(dryRun);
    }
    
    // 2. 심볼릭 링크 생성
    const { successCount, failCount } = createSymlinks(dryRun);
    
    // 3. ai_test 전용 항목 확인
    const missingItems = checkAiTestExclusiveItems();
    
    // 4. package.json 업데이트 (드라이런이 아닐 때)
    if (!dryRun && successCount > 0) {
      updateAiTestPackageJson();
    }
    
    console.log('─'.repeat(50));
    
    if (dryRun) {
      console.log('📋 드라이런 완료 - 실제 변경사항 없음');
      console.log('💡 실제 실행하려면 --dry-run 옵션을 제거하세요');
    } else {
      console.log('🎉 동기화 완료!');
      
      if (failCount > 0) {
        console.log(`⚠️ ${failCount}개 항목이 실패했습니다. 수동 확인이 필요할 수 있습니다.`);
      }
      
      if (missingItems.length > 0) {
        console.log(`📝 누락된 ai_test 전용 항목: ${missingItems.join(', ')}`);
        console.log('💡 메인 프로젝트에서 다음 명령어로 복사할 수 있습니다:');
        console.log(`  cp -r ${missingItems.map(item => `../${item}`).join(' ')} ./`);
      }
      
      console.log('\n📋 다음 단계:');
      console.log('  1. ai_test 디렉토리로 이동: cd ai_test');
      console.log('  2. 의존성 설치: npm install');
      console.log('  3. 개발 서버 실행: npm run dev:ai');
      console.log('  4. 빌드: npm run build:ai');
    }
    
  } catch (error) {
    console.error(`❌ 오류 발생: ${error.message}`);
    process.exit(1);
  }
}

// 스크립트 실행
main().catch(error => {
  console.error(`❌ 치명적 오류: ${error.message}`);
  process.exit(1);
});