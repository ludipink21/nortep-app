export const metadata = { title: "Política de privacidade — NorteP" };

export default function PrivacidadePage() {
  return <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
    <section style={{ maxWidth: 680, margin: "0 auto", padding: "clamp(32px, 6vw, 70px) clamp(18px, 4vw, 40px)" }}>
      <header style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span style={{ fontStyle: "normal", width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--gold-light, #e4c978)", color: "var(--tyrian-dark, #351021)", fontWeight: 900, fontSize: 13, fontFamily: "Georgia, serif" }}>NP</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "var(--muted)" }}>NORTEP PESQUISA</span>
        </div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(26px, 4vw, 36px)", margin: "0 0 8px", color: "var(--tyrian-dark, #351021)" }}>Política de privacidade</h1>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Última atualização: setembro de 2026</p>
      </header>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>1. Que dados são coletados</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px" }}>
          Quando você preenche o formulário de apoio ou mobilização da NorteP, coletamos apenas:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px", paddingLeft: 22 }}>
          <li>Nome completo</li>
          <li>Número de WhatsApp</li>
          <li>Cidade, UF, bairro e região</li>
          <li>Suas preferências de recebimento de conteúdos e participação</li>
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Não coletamos e-mail, documento de identificação, dados de geolocalização Precisão, nem informações financeiras.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>2. Finalidade do tratamento</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px" }}>
          Os dados são utilizados exclusivamente para:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px", paddingLeft: 22 }}>
          <li>Enviar comunicações da candidata conforme as opções que você autorizou</li>
          <li>Organizar encontros, reuniões e atividades de mobilização</li>
          <li>Registrar a origem do convite para organização interna</li>
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          <strong>Não é pesquisa eleitoral, pesquisa de opinião, registro de voto ou levantamento estatístico.</strong> Os dados não são usados para qualquer finalidade eleitoral ou de pesquisa.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>3. Base legal</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          O tratamento dos seus dados é fundamentado no <strong>consentimento</strong> (Art. 7º, inciso I, da Lei Geral de Proteção de Dados — LGPD). Você autoriza o armazenamento e uso dos dados ao marcar a caixa de consentimento no formulário. Sem esse consentimento, o formulário não é aceito.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>4. Retenção dos dados</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Seus dados serão mantidos enquanto a candidatura estiver ativa e as comunicações estiverem sendo realizadas. Você pode solicitar a exclusão dos seus dados a qualquer momento (veja Seção 7).
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>5. Compartilhamento com terceiros</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Seus dados <strong>não são compartilhados</strong> com terceiros, empresas parceiras, plataformas de publicidade ou outros agentes. O acesso aos dados é restrito à equipe diretamente envolvida na mobilização.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>6. Armazenamento local (localStorage)</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px" }}>
          O site utiliza <code style={{ background: "#f0ebe0", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>localStorage</code> do navegador para:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px", paddingLeft: 22 }}>
          <li>Lembrar que você já preencheu o formulário neste aparelho</li>
          <li>Disponibilizar seu link de compartilhamento sem precisar preencher novamente</li>
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Esses dados ficam apenas no seu dispositivo e não são enviados a servidores externos. Você pode limpá-los a qualquer momento ao apagar os dados do navegador.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>7. Seus direitos (Art. 18 da LGPD)</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px" }}>
          Como titular dos seus dados, você tem direito a:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.65, margin: "0 0 10px", paddingLeft: 22 }}>
          <li><strong>Acesso</strong> aos dados armazenados</li>
          <li><strong>Correção</strong> de dados incompletos ou desatualizados</li>
          <li><strong>Exclusão</strong> dos dados do banco de dados</li>
          <li><strong>Revogação</strong> do consentimento a qualquer momento</li>
          <li><strong>Informação</strong> sobre o uso compartilhado dos dados (se aplicável)</li>
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Para exercer qualquer desses direitos, entre em contato pelo e-mail indicado abaixo.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>8. Segurança dos dados</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Os dados são armazenados em ambiente seguro com acesso restrito. Utilizamos medidas técnicas e administrativas para proteger as informações contra acessos não autorizados, situações acidentais ou ilícitas de destruição, perda, alteração ou comunicação indevida.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 10px", color: "var(--tyrian-dark, #351021)" }}>9. Contato</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Em caso de dúvidas, solicitações ou exercício de direitos relacionados à proteção dos seus dados, entre em contato:
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: "10px 0 0" }}>
          <a href="mailto:privacidade@nortep.ia.br" style={{ color: "var(--tyrian, #5b1734)", fontWeight: 700 }}>privacidade@nortep.ia.br</a>
          <br />
          <small style={{ color: "var(--muted)" }}>E-mail dedicado para assuntos de privacidade e proteção de dados</small>
        </p>
      </section>

      <footer style={{ borderTop: "1px solid var(--line, #e1d9d6)", paddingTop: 20, marginTop: 40, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <a href="javascript:history.back()" style={{ color: "var(--tyrian, #5b1734)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>← Voltar</a>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          Sem e-mail · sem criação de conta · participação voluntária
        </span>
      </footer>
    </section>
  </main>;
}
