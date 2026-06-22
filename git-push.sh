#!/bin/bash

# PortAI Git Auto-Push Helper Script
echo "========================================="
      echo "🚀 PortAI 자동화 푸시 파이프라인 시작"
echo "========================================="

# 1. 테스트 실행
echo "🔍 1단계: 로컬 테스트 실행 중 (npm run test)..."
npm run test
if [ $? -ne 0 ]; then
  echo "❌ 테스트가 실패했습니다. 코드를 확인 후 다시 시도해 주세요."
  exit 1
fi
echo "✅ 테스트 통과 완료!"

# 2. 빌드 실행
echo "📦 2단계: 프로덕션 빌드 체크 (npm run build)..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ 빌드 에러가 발생했습니다. 컴파일러 경고를 확인해 주세요."
  exit 1
fi
echo "✅ 빌드 정밀 검증 성공!"

# 3. 커밋 메시지 입력 받기
echo "📝 3단계: 커밋 메시지를 입력해 주세요 (빈 칸 입력 시 'update: code modifications' 적용):"
read -r commit_msg
if [ -z "$commit_msg" ]; then
  commit_msg="update: code modifications"
fi

# 4. Git 스테이징 및 커밋
echo "💾 4단계: 로컬 변경사항 저장소 반영..."
git add .
git commit -m "$commit_msg"

# 5. Git 푸시
echo "☁️ 5단계: GitHub 원격 저장소 푸시..."
git push origin main

if [ $? -eq 0 ]; then
  echo "========================================="
        echo "🎉 원격 저장소 푸시가 성공적으로 완료되었습니다!"
  echo "========================================="
else
  echo "❌ 푸시 중 에러가 발생했습니다. 원격 저장소(origin) 연결 상태를 확인해 주세요."
fi
