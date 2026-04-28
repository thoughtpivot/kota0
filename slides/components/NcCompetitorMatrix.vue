<template>
  <div class="nc-comp-matrix" role="table" aria-label="Competitive landscape summary">
    <div class="nc-comp-matrix__scroll">
      <table class="nc-comp-matrix__table">
        <thead>
          <tr>
            <th scope="col">Alternative</th>
            <th scope="col">How they play</th>
            <th scope="col">Our response</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Viktor AI</th>
            <td>Productized AEC “vibe” with subscription economics</td>
            <td>Customer-owned deployment, real Node + Vue + exportable code path</td>
          </tr>
          <tr>
            <th scope="row">VibeWork</th>
            <td>General app builder; not AEC workflow–native</td>
            <td>Subject-based, AEC/IT-shaped delivery from day one</td>
          </tr>
          <tr>
            <th scope="row">Stack AI</th>
            <td>Workflow / automation; less full custom app + API surface</td>
            <td>Full app + REST backend: data model in Scribe, not a black box</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="nc-comp-matrix__note" aria-hidden="true">
      Names for orientation — validate positioning before external use.
    </p>
  </div>
</template>
