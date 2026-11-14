# 🩸 Sangue Escuro RPG — Dark Blood RPG

Bem-vindo ao projeto **Sangue Escuro RPG**! Este repositório contém o sistema de regras para **Foundry Virtual Tabletop**, com regras de sobrevivência, fichas de personagens e criaturas.

---

## 🎲 Como instalar no Foundry

Você precisa do **Foundry VTT 13**. Para instalar e jogar, não é necessário instalar o Git.

1. Abra a tela de configuração do Foundry.
2. Entre em **Sistemas de jogo → Instalar sistema**.
3. Cole o endereço abaixo no campo **URL do manifesto**:

```text
https://raw.githubusercontent.com/yobwarz/Dark_Blood_RPG/main/system.json
```

4. Clique em **Instalar**.
5. Crie um mundo e selecione **Sangue Escuro RPG** como sistema.

---

## 📦 Como baixar o projeto para editar

### 1. Instalar o Git

Se você ainda não tem o Git instalado:

- Baixe em: [git-scm.com](https://git-scm.com/).
- Siga as instruções do instalador para o seu sistema operacional.

### 2. Clonar o repositório

Abra o terminal (Prompt de Comando, PowerShell ou Git Bash) e execute:

```bash
git clone https://github.com/yobwarz/Dark_Blood_RPG.git
```

Isso cria uma pasta com os arquivos do projeto no seu computador.

### 3. Entrar na pasta do projeto

```bash
cd Dark_Blood_RPG
```

Você também pode baixar os arquivos pelo botão **Code → Download ZIP** no GitHub. Os comandos de atualização com Git abaixo se aplicam à cópia criada com `git clone`.

---

## 🔄 Como atualizar o projeto

Dentro da pasta do repositório, execute:

```bash
git pull
```

Se houver alterações locais, salve-as em um commit ou use `git stash` antes de atualizar.

Para quem joga, as versões publicadas podem ser obtidas pela atualização do sistema na tela de configuração do Foundry. Faça backup dos seus mundos antes de atualizar.

---

## 🛠️ Como enviar alterações para o GitHub

Você precisa de permissão de escrita no repositório e de autenticação no GitHub.

### 1. Atualizar sua cópia antes de trabalhar

```bash
git pull
```

### 2. Fazer alterações no projeto

Edite os arquivos e teste as mudanças no Foundry VTT 13.

### 3. Adicionar os arquivos modificados

```bash
git add .
```

### 4. Criar um commit

```bash
git commit -m "Descreve as alterações realizadas"
```

### 5. Enviar para o GitHub

```bash
git push
```

Esses comandos enviam o código. Para disponibilizar uma nova versão pelo instalador do Foundry, siga também as etapas abaixo.

---

## 🏷️ Como publicar uma nova versão

O manifesto público fica na branch `main`, e o ZIP de cada versão fica na pasta `dist` da respectiva tag.

Exemplo de publicação da versão **0.8.7**:

1. Atualize o campo `version` do `system.json` para `0.8.7`.
2. Atualize o campo `download` para:

```text
https://raw.githubusercontent.com/yobwarz/Dark_Blood_RPG/v0.8.7/dist/sangue-escuro.zip
```

3. Mantenha o campo `manifest` com este endereço:

```text
https://raw.githubusercontent.com/yobwarz/Dark_Blood_RPG/main/system.json
```

4. Gere um novo `sangue-escuro.zip` com os arquivos do sistema e o manifesto atualizado. O `system.json` deve estar diretamente na raiz do ZIP. Não inclua as pastas `.git` e `dist`.
5. Substitua `dist/sangue-escuro.zip` pelo novo pacote e teste a instalação em um ambiente separado.
6. Salve as alterações e crie a tag:

```bash
git add .
git commit -m "Prepara versão 0.8.7"
git tag v0.8.7
git push origin v0.8.7
git push origin main
```

7. No GitHub, abra **Releases → Draft a new release**, selecione a tag `v0.8.7`, descreva as mudanças e clique em **Publish release**.

Nesse formato, o pacote é baixado diretamente do repositório; não é necessário anexá-lo à Release. A tag deve existir antes da atualização da branch `main`, para que o manifesto público aponte para um pacote disponível.

Use um novo número a cada publicação e preserve as tags já publicadas.

---

## ⚠️ Dicas importantes

- Atualize sua cópia com `git pull` antes de começar a trabalhar.
- Evite editar os mesmos arquivos em dois lugares ao mesmo tempo.
- Faça commits com mensagens claras.
- Confira os arquivos com `git status` antes de enviar; não publique senhas, tokens ou arquivos pessoais.
- Faça backup dos mundos e teste novas versões antes de usá-las em uma campanha.

---

## 🧙 Sobre o projeto

**Sangue Escuro RPG — Dark Blood RPG** é um sistema para Foundry VTT com regras de sobrevivência e suporte a personagens, criaturas, armas, proteções, habilidades e equipamentos.

Encontrou um problema ou tem uma sugestão? Abra uma [Issue](https://github.com/yobwarz/Dark_Blood_RPG/issues) descrevendo o caso.
